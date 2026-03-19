package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go/core"
	"github.com/hyperterse/sandboxer/sdks/go/core/httpclient"
)

func init() {
	core.RegisterProvider(core.ProviderDaytona, newDaytona)
}

const (
	daytonaDefaultAPI     = "https://app.daytona.io/api"
	daytonaDefaultToolbox = "https://proxy.app.daytona.io/toolbox"
)

type daytonaProvider struct {
	cfg      core.Config
	hc       *httpclient.Client
	token    string
	apiBase  string
	toolBase string
}

func newDaytona(cfg core.Config) (core.Provider, error) {
	tok := daytonaFirstNonEmpty(cfg.APIKey, os.Getenv("DAYTONA_API_KEY"), os.Getenv("DAYTONA_TOKEN"))
	if tok == "" {
		return nil, fmt.Errorf("%w: Daytona API token required (SANDBOXER_API_KEY or DAYTONA_API_KEY)", core.ErrBadConfig)
	}
	hc, err := httpclient.New(cfg)
	if err != nil {
		return nil, err
	}
	api := cfg.BaseURL
	if api == "" {
		api = daytonaDefaultAPI
	}
	tb := os.Getenv("DAYTONA_TOOLBOX_BASE_URL")
	if tb == "" {
		tb = daytonaDefaultToolbox
	}
	return &daytonaProvider{
		cfg:      cfg,
		hc:       hc,
		token:    tok,
		apiBase:  strings.TrimRight(api, "/"),
		toolBase: strings.TrimRight(tb, "/"),
	}, nil
}

func (p *daytonaProvider) Close() error { return nil }

func (p *daytonaProvider) hdr() map[string]string {
	return map[string]string{"Authorization": "Bearer " + p.token}
}

func (p *daytonaProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	if filter.Provider != nil && *filter.Provider != core.ProviderDaytona {
		return nil, nil
	}
	u := p.apiBase + "/sandbox"
	if filter.Limit > 0 {
		u += "?limit=" + strconv.Itoa(filter.Limit)
	}
	var rows []json.RawMessage
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.hdr(), nil, &rows); err != nil {
		return nil, daytonaMapErr(err)
	}
	out := make([]core.SandboxInfo, 0, len(rows))
	for _, raw := range rows {
		var s struct {
			ID       string            `json:"id"`
			Name     string            `json:"name"`
			State    string            `json:"state"`
			Image    string            `json:"image"`
			Metadata map[string]string `json:"labels"`
		}
		if json.Unmarshal(raw, &s) != nil {
			continue
		}
		if filter.MetadataFilter != "" && !metaHas(s.Metadata, filter.MetadataFilter) {
			continue
		}
		info := core.SandboxInfo{
			ID:        daytonaFirstNonEmpty(s.ID, s.Name),
			Provider:  core.ProviderDaytona,
			Status:    core.SandboxRunning,
			Metadata:  s.Metadata,
			StartedAt: time.Now(),
		}
		if s.Image != "" {
			im := s.Image
			info.Template = &im
		}
		switch strings.ToLower(s.State) {
		case "stopped", "archived":
			info.Status = core.SandboxStopped
		case "starting", "creating":
			info.Status = core.SandboxStarting
		}
		out = append(out, info)
	}
	return out, nil
}

func metaHas(m map[string]string, needle string) bool {
	if needle == "" {
		return true
	}
	for _, v := range m {
		if strings.Contains(v, needle) {
			return true
		}
	}
	return false
}

func (p *daytonaProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	u := fmt.Sprintf("%s/sandbox/%s", p.apiBase, url.PathEscape(sandboxID))
	_, err := p.hc.Do(ctx, http.MethodDelete, u, p.hdr(), nil, nil)
	return daytonaMapErr(err)
}

func (p *daytonaProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	if req.Provider != core.ProviderDaytona && req.Provider != "" {
		return nil, core.SandboxInfo{}, fmt.Errorf("%w: provider mismatch", core.ErrBadConfig)
	}
	body := map[string]any{
		"env": req.Metadata,
	}
	if req.Template != nil && *req.Template != "" {
		body["image"] = *req.Template
	}
	if len(req.Envs) > 0 {
		body["envVars"] = req.Envs
	}
	if req.CPUs != nil || req.MemoryMb != nil {
		res := map[string]any{}
		if req.CPUs != nil {
			res["cpu"] = *req.CPUs
		}
		if req.MemoryMb != nil {
			res["memory"] = *req.MemoryMb
		}
		body["resources"] = res
	}
	var created struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		State string `json:"state"`
		Image string `json:"image"`
	}
	u := p.apiBase + "/sandbox"
	if _, err := p.hc.Do(ctx, http.MethodPost, u, p.hdr(), body, &created); err != nil {
		return nil, core.SandboxInfo{}, daytonaMapErr(err)
	}
	id := daytonaFirstNonEmpty(created.ID, created.Name)
	sb := &daytonaSandbox{p: p, id: id}
	info, err := sb.Info(ctx)
	if err != nil {
		info = core.SandboxInfo{ID: id, Provider: core.ProviderDaytona, Status: core.SandboxRunning, StartedAt: time.Now()}
		if created.Image != "" {
			im := created.Image
			info.Template = &im
		}
	}
	return sb, info, nil
}

func (p *daytonaProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	sb := &daytonaSandbox{p: p, id: sandboxID}
	if _, err := sb.Info(ctx); err != nil {
		return nil, err
	}
	return sb, nil
}

type daytonaSandbox struct {
	p  *daytonaProvider
	id string
}

func (s *daytonaSandbox) ID() string { return s.id }

func (s *daytonaSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	u := fmt.Sprintf("%s/sandbox/%s", s.p.apiBase, url.PathEscape(s.id))
	var d struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		State string `json:"state"`
		Image string `json:"image"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.hdr(), nil, &d); err != nil {
		return core.SandboxInfo{}, daytonaMapErr(err)
	}
	id := daytonaFirstNonEmpty(d.ID, d.Name)
	st := core.SandboxRunning
	switch strings.ToLower(d.State) {
	case "stopped", "archived":
		st = core.SandboxStopped
	case "starting", "creating":
		st = core.SandboxStarting
	}
	info := core.SandboxInfo{ID: id, Provider: core.ProviderDaytona, Status: st, StartedAt: time.Now()}
	if d.Image != "" {
		im := d.Image
		info.Template = &im
	}
	return info, nil
}

func (s *daytonaSandbox) IsRunning(ctx context.Context) (bool, error) {
	i, err := s.Info(ctx)
	if err != nil {
		return false, err
	}
	return i.Status == core.SandboxRunning || i.Status == core.SandboxStarting, nil
}

func (s *daytonaSandbox) Pause(ctx context.Context) error {
	u := fmt.Sprintf("%s/sandbox/%s/stop", s.p.apiBase, url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return daytonaMapErr(err)
}

func (s *daytonaSandbox) Resume(ctx context.Context) error {
	u := fmt.Sprintf("%s/sandbox/%s/start", s.p.apiBase, url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return daytonaMapErr(err)
}

func (s *daytonaSandbox) Kill(ctx context.Context) error {
	return s.p.KillSandbox(ctx, s.id)
}

func (s *daytonaSandbox) PortURL(ctx context.Context, port int) (string, error) {
	_ = ctx
	return "", core.ErrNotSupported
}

func (s *daytonaSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	start := time.Now()
	u := fmt.Sprintf("%s/%s/process/execute", s.p.toolBase, url.PathEscape(s.id))
	body := map[string]any{"command": req.Cmd}
	if req.Cwd != nil {
		body["cwd"] = *req.Cwd
	}
	if req.TimeoutSeconds != nil {
		body["timeout"] = *req.TimeoutSeconds
	}
	if len(req.Env) > 0 {
		body["env"] = req.Env
	}
	var out struct {
		ExitCode  int    `json:"exitCode"`
		ExitCode2 int    `json:"exit_code"`
		Result    string `json:"result"`
		Stdout    string `json:"stdout"`
		Stderr    string `json:"stderr"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), body, &out); err != nil {
		return core.CommandResult{}, daytonaMapErr(err)
	}
	code := out.ExitCode
	if code == 0 && out.ExitCode2 != 0 {
		code = out.ExitCode2
	}
	stdout := daytonaFirstNonEmpty(out.Stdout, out.Result)
	return core.CommandResult{
		Stdout:     stdout,
		Stderr:     out.Stderr,
		ExitCode:   code,
		DurationMs: core.ElapsedMillis(start),
	}, nil
}

func (s *daytonaSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	_ = ctx
	_ = req
	return 0, "", core.ErrNotSupported
}

func (s *daytonaSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	_ = ctx
	_ = handleID
	return core.CommandResult{}, core.ErrNotSupported
}

func (s *daytonaSandbox) KillProcess(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *daytonaSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func (s *daytonaSandbox) ReadFile(ctx context.Context, path string) ([]byte, error) {
	u := fmt.Sprintf("%s/%s/files/download?path=%s", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, core.ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return nil, daytonaHTTPErr(resp.StatusCode, b)
	}
	return b, nil
}

func (s *daytonaSandbox) WriteFile(ctx context.Context, pth string, content []byte, mode *int, user *string) error {
	_ = mode
	_ = user
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("path", pth)
	part, err := mw.CreateFormFile("file", "file")
	if err != nil {
		return err
	}
	if _, err := part.Write(content); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}
	u := fmt.Sprintf("%s/%s/files/upload?path=%s", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(pth))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return daytonaHTTPErr(resp.StatusCode, raw)
	}
	return nil
}

func (s *daytonaSandbox) ListDirectory(ctx context.Context, path string) ([]core.FileInfo, error) {
	u := fmt.Sprintf("%s/%s/files?path=%s", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, daytonaHTTPErr(resp.StatusCode, raw)
	}
	var entries []struct {
		Name  string `json:"name"`
		Path  string `json:"path"`
		IsDir bool   `json:"isDir"`
		Size  int64  `json:"size"`
	}
	if err := json.Unmarshal(raw, &entries); err != nil {
		var wrap struct {
			Entries []struct {
				Name  string `json:"name"`
				Path  string `json:"path"`
				IsDir bool   `json:"isDir"`
				Size  int64  `json:"size"`
			} `json:"entries"`
		}
		if err2 := json.Unmarshal(raw, &wrap); err2 != nil {
			return nil, err
		}
		entries = wrap.Entries
	}
	out := make([]core.FileInfo, 0, len(entries))
	for _, e := range entries {
		p := e.Path
		if p == "" {
			p = path + "/" + e.Name
		}
		out = append(out, core.FileInfo{Name: e.Name, Path: p, IsDir: e.IsDir, Size: e.Size})
	}
	return out, nil
}

func (s *daytonaSandbox) MakeDir(ctx context.Context, path string) error {
	u := fmt.Sprintf("%s/%s/files/folder?path=%s&mode=755", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, nil)
	if err != nil {
		return err
	}
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return daytonaHTTPErr(resp.StatusCode, raw)
	}
	return nil
}

func (s *daytonaSandbox) Remove(ctx context.Context, path string) error {
	u := fmt.Sprintf("%s/%s/files?path=%s", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return daytonaHTTPErr(resp.StatusCode, raw)
	}
	return nil
}

func (s *daytonaSandbox) Exists(ctx context.Context, path string) (bool, error) {
	u := fmt.Sprintf("%s/%s/files/info?path=%s", s.p.toolBase, url.PathEscape(s.id), url.QueryEscape(path))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	for k, v := range s.p.hdr() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, fmt.Errorf("daytona: status %d", resp.StatusCode)
	}
	return true, nil
}

func (s *daytonaSandbox) CreatePTY(ctx context.Context, req core.CreatePTYRequest) (core.PTYInfo, error) {
	_ = ctx
	_ = req
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *daytonaSandbox) ResizePTY(ctx context.Context, pid int, rows, cols int) error {
	_ = ctx
	_ = pid
	_ = rows
	_ = cols
	return core.ErrNotSupported
}

func (s *daytonaSandbox) KillPTY(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *daytonaSandbox) ListPTY(ctx context.Context) ([]core.PTYInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func daytonaFirstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func daytonaMapErr(err error) error {
	if err == nil {
		return nil
	}
	if he, ok := err.(httpclient.HTTPError); ok {
		if he.Status == http.StatusNotFound {
			return core.ErrNotFound
		}
		sc := he.Status
		return &core.ProviderError{Provider: core.ProviderDaytona, StatusCode: &sc, Message: string(he.Body)}
	}
	return err
}

func daytonaHTTPErr(code int, body []byte) error {
	sc := code
	return &core.ProviderError{Provider: core.ProviderDaytona, StatusCode: &sc, Message: string(body)}
}
