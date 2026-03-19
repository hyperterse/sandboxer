package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	core.RegisterProvider(core.ProviderBlaxel, newBlaxel)
}

const blaxelDefaultControlPlane = "https://api.blaxel.ai/v0"

type blaxelProvider struct {
	cfg       core.Config
	hc        *httpclient.Client
	token     string
	control   string
	workspace string
}

func newBlaxel(cfg core.Config) (core.Provider, error) {
	tok := blaxelFirstNonEmpty(cfg.APIKey, os.Getenv("BLAXEL_API_KEY"), os.Getenv("BL_API_KEY"), os.Getenv("SANDBOXER_API_KEY"))
	if tok == "" {
		return nil, fmt.Errorf("%w: Blaxel API key required (SANDBOXER_API_KEY, BLAXEL_API_KEY, BL_API_KEY)", core.ErrBadConfig)
	}
	hc, err := httpclient.New(cfg)
	if err != nil {
		return nil, err
	}
	b := cfg.BaseURL
	if b == "" {
		b = os.Getenv("BLAXEL_API_BASE")
	}
	if b == "" {
		b = blaxelDefaultControlPlane
	}
	ws := blaxelFirstNonEmpty(os.Getenv("BLAXEL_WORKSPACE"), os.Getenv("BL_WORKSPACE"))
	return &blaxelProvider{cfg: cfg, hc: hc, token: tok, control: strings.TrimRight(b, "/"), workspace: ws}, nil
}

func (p *blaxelProvider) controlHeaders() map[string]string {
	h := map[string]string{"Authorization": "Bearer " + p.token}
	if p.workspace != "" {
		h["X-Blaxel-Workspace"] = p.workspace
	}
	return h
}

func (p *blaxelProvider) sandboxHeaders() map[string]string {
	return map[string]string{"Authorization": "Bearer " + p.token}
}

func (p *blaxelProvider) Close() error { return nil }

func (p *blaxelProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	if filter.Provider != nil && *filter.Provider != core.ProviderBlaxel {
		return nil, nil
	}
	u := p.control + "/sandboxes"
	var rows []json.RawMessage
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.controlHeaders(), nil, &rows); err != nil {
		return nil, blaxelMapErr(err)
	}
	out := make([]core.SandboxInfo, 0, len(rows))
	for _, raw := range rows {
		var s blaxelSandboxRow
		if json.Unmarshal(raw, &s) != nil {
			continue
		}
		name := ""
		if s.Metadata != nil {
			name = s.Metadata.Name
		}
		if name == "" {
			continue
		}
		if filter.MetadataFilter != "" {
			hay := name
			if s.Metadata != nil && s.Metadata.Labels != nil {
				for _, v := range s.Metadata.Labels {
					hay += " " + v
				}
			}
			if !strings.Contains(hay, filter.MetadataFilter) {
				continue
			}
		}
		info := blaxelRowToInfo(&s, name)
		out = append(out, info)
		if filter.Limit > 0 && len(out) >= filter.Limit {
			break
		}
	}
	return out, nil
}

func (p *blaxelProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	u := fmt.Sprintf("%s/sandboxes/%s", p.control, url.PathEscape(sandboxID))
	_, err := p.hc.Do(ctx, http.MethodDelete, u, p.controlHeaders(), nil, nil)
	return blaxelMapErr(err)
}

func (p *blaxelProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	name := ""
	if req.Metadata != nil {
		name = blaxelFirstNonEmpty(req.Metadata["name"], req.Metadata["sandboxName"])
	}
	if name == "" {
		name = fmt.Sprintf("sandboxer-%d-%d", time.Now().UnixNano(), time.Now().Nanosecond()%100000)
	}

	runtime := map[string]any{
		"image": blaxelDeref(req.Template, "blaxel/base-image:latest"),
	}
	if req.MemoryMb != nil {
		runtime["memory"] = *req.MemoryMb
	} else if req.CPUs != nil {
		runtime["memory"] = *req.CPUs * 2048
	} else {
		runtime["memory"] = 4096
	}
	if len(req.Envs) > 0 {
		envs := make([]map[string]string, 0, len(req.Envs))
		for k, v := range req.Envs {
			envs = append(envs, map[string]string{"name": k, "value": v})
		}
		runtime["envs"] = envs
	}

	md := map[string]any{"name": name}
	if len(req.Metadata) > 0 {
		if labs := blaxelStripNameLabels(req.Metadata); len(labs) > 0 {
			md["labels"] = labs
		}
	}
	body := map[string]any{
		"metadata": md,
		"spec":     map[string]any{"runtime": runtime},
	}
	u := p.control + "/sandboxes"
	if req.Metadata != nil && req.Metadata["createIfNotExist"] == "true" {
		u += "?createIfNotExist=true"
	}
	var created blaxelSandboxRow
	if _, err := p.hc.Do(ctx, http.MethodPost, u, p.controlHeaders(), body, &created); err != nil {
		return nil, core.SandboxInfo{}, blaxelMapErr(err)
	}

	baseURL := blaxelNormalizeURL(blaxelURLFromRow(&created))
	if baseURL == "" {
		gu := fmt.Sprintf("%s/sandboxes/%s", p.control, url.PathEscape(name))
		var again blaxelSandboxRow
		if _, err := p.hc.Do(ctx, http.MethodGet, gu, p.controlHeaders(), nil, &again); err != nil {
			return nil, core.SandboxInfo{}, blaxelMapErr(err)
		}
		baseURL = blaxelNormalizeURL(blaxelURLFromRow(&again))
	}
	if baseURL == "" {
		return nil, core.SandboxInfo{}, &core.ProviderError{Provider: core.ProviderBlaxel, Message: "sandbox created but no endpoint URL in response (metadata.url)"}
	}

	sb := &blaxelSandbox{p: p, id: name, baseURL: baseURL}
	info := blaxelRowToInfo(&created, name)
	return sb, info, nil
}

func (p *blaxelProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	u := fmt.Sprintf("%s/sandboxes/%s", p.control, url.PathEscape(sandboxID))
	var row blaxelSandboxRow
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.controlHeaders(), nil, &row); err != nil {
		return nil, blaxelMapErr(err)
	}
	name := sandboxID
	if row.Metadata != nil && row.Metadata.Name != "" {
		name = row.Metadata.Name
	}
	baseURL := blaxelNormalizeURL(blaxelURLFromRow(&row))
	if baseURL == "" {
		return nil, &core.ProviderError{Provider: core.ProviderBlaxel, Message: "sandbox has no endpoint URL (metadata.url); cannot attach"}
	}
	return &blaxelSandbox{p: p, id: name, baseURL: baseURL}, nil
}

type blaxelSandboxRow struct {
	Metadata *struct {
		Name      string            `json:"name"`
		URL       string            `json:"url"`
		Labels    map[string]string `json:"labels"`
		CreatedAt string            `json:"createdAt"`
	} `json:"metadata"`
	Spec *struct {
		Runtime *struct {
			Image  string `json:"image"`
			Memory int    `json:"memory"`
		} `json:"runtime"`
	} `json:"spec"`
	Status string `json:"status"`
}

func blaxelURLFromRow(row *blaxelSandboxRow) string {
	if row == nil || row.Metadata == nil {
		return ""
	}
	return row.Metadata.URL
}

func blaxelNormalizeURL(u string) string {
	return strings.TrimRight(u, "/")
}

func blaxelStripNameLabels(m map[string]string) map[string]string {
	out := make(map[string]string)
	for k, v := range m {
		if k != "name" && k != "sandboxName" && k != "createIfNotExist" {
			out[k] = v
		}
	}
	return out
}

func blaxelDeref(p *string, def string) string {
	if p != nil && *p != "" {
		return *p
	}
	return def
}

func blaxelEncodeFsPath(p string) string {
	p = strings.TrimLeft(p, "/")
	if p == "" {
		return ""
	}
	parts := strings.Split(p, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

func blaxelMapDeploymentStatus(s string) core.SandboxStatus {
	switch strings.ToUpper(s) {
	case "DEPLOYED":
		return core.SandboxRunning
	case "DEPLOYING", "BUILDING", "UPLOADING":
		return core.SandboxStarting
	case "DEACTIVATED", "TERMINATED", "DELETING", "DEACTIVATING":
		return core.SandboxStopped
	case "FAILED":
		return core.SandboxError
	default:
		return core.SandboxRunning
	}
}

func blaxelRowToInfo(row *blaxelSandboxRow, id string) core.SandboxInfo {
	info := core.SandboxInfo{
		ID:        id,
		Provider:  core.ProviderBlaxel,
		Status:    blaxelMapDeploymentStatus(row.Status),
		StartedAt: time.Now(),
	}
	if row.Metadata != nil {
		info.Metadata = row.Metadata.Labels
		if row.Metadata.CreatedAt != "" {
			if t, err := time.Parse(time.RFC3339, row.Metadata.CreatedAt); err == nil {
				info.StartedAt = t
			}
		}
	}
	if row.Spec != nil && row.Spec.Runtime != nil {
		if row.Spec.Runtime.Image != "" {
			im := row.Spec.Runtime.Image
			info.Template = &im
		}
		if row.Spec.Runtime.Memory > 0 {
			m := row.Spec.Runtime.Memory
			info.MemoryMb = &m
			c := m / 2048
			info.CPUs = &c
		}
	}
	return info
}

type blaxelSandbox struct {
	p       *blaxelProvider
	id      string
	baseURL string
}

func (s *blaxelSandbox) ID() string { return s.id }

func (s *blaxelSandbox) fsURL(path string) string {
	enc := blaxelEncodeFsPath(path)
	return fmt.Sprintf("%s/filesystem/%s", s.baseURL, enc)
}

func (s *blaxelSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	u := fmt.Sprintf("%s/sandboxes/%s", s.p.control, url.PathEscape(s.id))
	var row blaxelSandboxRow
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.controlHeaders(), nil, &row); err != nil {
		return core.SandboxInfo{}, blaxelMapErr(err)
	}
	return blaxelRowToInfo(&row, s.id), nil
}

func (s *blaxelSandbox) IsRunning(ctx context.Context) (bool, error) {
	i, err := s.Info(ctx)
	if err != nil {
		return false, err
	}
	return i.Status == core.SandboxRunning || i.Status == core.SandboxStarting, nil
}

func (s *blaxelSandbox) Pause(ctx context.Context) error {
	_ = ctx
	return core.ErrNotSupported
}

func (s *blaxelSandbox) Resume(ctx context.Context) error {
	_ = ctx
	return core.ErrNotSupported
}

func (s *blaxelSandbox) Kill(ctx context.Context) error {
	return s.p.KillSandbox(ctx, s.id)
}

func (s *blaxelSandbox) PortURL(ctx context.Context, port int) (string, error) {
	_ = ctx
	return fmt.Sprintf("%s/port/%d", s.baseURL, port), nil
}

func (s *blaxelSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	start := time.Now()
	body := map[string]any{
		"command":           req.Cmd,
		"waitForCompletion": true,
	}
	if req.Cwd != nil {
		body["workingDir"] = *req.Cwd
	}
	if req.TimeoutSeconds != nil {
		body["timeout"] = *req.TimeoutSeconds
	}
	if len(req.Env) > 0 {
		body["env"] = req.Env
	}
	var out struct {
		ExitCode int    `json:"exitCode"`
		Stdout   string `json:"stdout"`
		Stderr   string `json:"stderr"`
	}
	u := s.baseURL + "/process"
	if _, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.sandboxHeaders(), body, &out); err != nil {
		return core.CommandResult{}, blaxelMapErr(err)
	}
	return core.CommandResult{
		Stdout:     out.Stdout,
		Stderr:     out.Stderr,
		ExitCode:   out.ExitCode,
		DurationMs: core.ElapsedMillis(start),
	}, nil
}

func (s *blaxelSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	body := map[string]any{
		"command":           req.Cmd,
		"waitForCompletion": false,
	}
	if req.Cwd != nil {
		body["workingDir"] = *req.Cwd
	}
	if len(req.Env) > 0 {
		body["env"] = req.Env
	}
	var out struct {
		PID string `json:"pid"`
	}
	u := s.baseURL + "/process"
	if _, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.sandboxHeaders(), body, &out); err != nil {
		return 0, "", blaxelMapErr(err)
	}
	if out.PID == "" {
		return 0, "", &core.ProviderError{Provider: core.ProviderBlaxel, Message: "process start did not return pid"}
	}
	pid, err := strconv.Atoi(out.PID)
	if err != nil {
		return 0, "", err
	}
	return pid, out.PID, nil
}

func (s *blaxelSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	start := time.Now()
	deadline := time.Now().Add(3600 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return core.CommandResult{}, ctx.Err()
		default:
		}
		u := fmt.Sprintf("%s/process/%s", s.baseURL, url.PathEscape(handleID))
		var last struct {
			Status   string `json:"status"`
			ExitCode int    `json:"exitCode"`
			Stdout   string `json:"stdout"`
			Stderr   string `json:"stderr"`
		}
		if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.sandboxHeaders(), nil, &last); err != nil {
			return core.CommandResult{}, blaxelMapErr(err)
		}
		st := strings.ToLower(last.Status)
		if st == "completed" || st == "failed" || st == "killed" || st == "stopped" {
			code := last.ExitCode
			if st != "completed" && code == 0 {
				code = 1
			}
			return core.CommandResult{
				Stdout:     last.Stdout,
				Stderr:     last.Stderr,
				ExitCode:   code,
				DurationMs: core.ElapsedMillis(start),
			}, nil
		}
		time.Sleep(400 * time.Millisecond)
	}
	return core.CommandResult{}, &core.ProviderError{Provider: core.ProviderBlaxel, Message: "waitForHandle: timeout waiting for process"}
}

func (s *blaxelSandbox) KillProcess(ctx context.Context, pid int) error {
	u := fmt.Sprintf("%s/process/%s/kill", s.baseURL, url.PathEscape(strconv.Itoa(pid)))
	_, err := s.p.hc.Do(ctx, http.MethodDelete, u, s.p.sandboxHeaders(), nil, nil)
	return blaxelMapErr(err)
}

func (s *blaxelSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	u := s.baseURL + "/process"
	var rows []struct {
		PID     string `json:"pid"` // API returns string PID
		Command string `json:"command"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.sandboxHeaders(), nil, &rows); err != nil {
		return nil, blaxelMapErr(err)
	}
	out := make([]core.ProcessInfo, 0, len(rows))
	for _, p := range rows {
		pid, _ := strconv.Atoi(p.PID)
		out = append(out, core.ProcessInfo{PID: pid, Command: p.Command})
	}
	return out, nil
}

func (s *blaxelSandbox) ReadFile(ctx context.Context, path string) ([]byte, error) {
	u := s.fsURL(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range s.p.sandboxHeaders() {
		req.Header.Set(k, v)
	}
	req.Header.Set("Accept", "application/octet-stream,*/*")
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, core.ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return nil, blaxelHTTPErr(resp.StatusCode, raw)
	}
	return raw, nil
}

func (s *blaxelSandbox) WriteFile(ctx context.Context, pth string, content []byte, mode *int, user *string) error {
	_ = user
	body := map[string]any{
		"content": blaxelLatin1String(content),
	}
	if mode != nil {
		body["permissions"] = fmt.Sprintf("%03o", *mode&0o777)
	}
	u := s.fsURL(pth)
	_, err := s.p.hc.Do(ctx, http.MethodPut, u, s.p.sandboxHeaders(), body, nil)
	return blaxelMapErr(err)
}

func (s *blaxelSandbox) ListDirectory(ctx context.Context, path string) ([]core.FileInfo, error) {
	u := s.fsURL(path)
	var dir struct {
		Files []struct {
			Name string `json:"name"`
			Path string `json:"path"`
			Size int64  `json:"size"`
		} `json:"files"`
		Subdirectories []struct {
			Name string `json:"name"`
			Path string `json:"path"`
		} `json:"subdirectories"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.sandboxHeaders(), nil, &dir); err != nil {
		return nil, blaxelMapErr(err)
	}
	out := make([]core.FileInfo, 0, len(dir.Files)+len(dir.Subdirectories))
	for _, f := range dir.Files {
		out = append(out, core.FileInfo{Name: f.Name, Path: f.Path, IsDir: false, Size: f.Size})
	}
	for _, d := range dir.Subdirectories {
		out = append(out, core.FileInfo{Name: d.Name, Path: d.Path, IsDir: true, Size: 0})
	}
	return out, nil
}

func (s *blaxelSandbox) MakeDir(ctx context.Context, path string) error {
	u := s.fsURL(path)
	_, err := s.p.hc.Do(ctx, http.MethodPut, u, s.p.sandboxHeaders(), map[string]any{"isDirectory": true}, nil)
	return blaxelMapErr(err)
}

func (s *blaxelSandbox) Remove(ctx context.Context, path string) error {
	u := s.fsURL(path) + "?recursive=true"
	_, err := s.p.hc.Do(ctx, http.MethodDelete, u, s.p.sandboxHeaders(), nil, nil)
	return blaxelMapErr(err)
}

func (s *blaxelSandbox) Exists(ctx context.Context, path string) (bool, error) {
	u := s.fsURL(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	for k, v := range s.p.sandboxHeaders() {
		req.Header.Set(k, v)
	}
	resp, err := s.p.hc.HTTP.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, blaxelHTTPErr(resp.StatusCode, raw)
	}
	return true, nil
}

func (s *blaxelSandbox) CreatePTY(ctx context.Context, req core.CreatePTYRequest) (core.PTYInfo, error) {
	_ = ctx
	_ = req
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *blaxelSandbox) ResizePTY(ctx context.Context, pid int, rows, cols int) error {
	_ = ctx
	_ = pid
	_ = rows
	_ = cols
	return core.ErrNotSupported
}

func (s *blaxelSandbox) KillPTY(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *blaxelSandbox) ListPTY(ctx context.Context) ([]core.PTYInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func blaxelLatin1String(b []byte) string {
	r := make([]rune, len(b))
	for i, c := range b {
		r[i] = rune(c)
	}
	return string(r)
}

func blaxelFirstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func blaxelMapErr(err error) error {
	if err == nil {
		return nil
	}
	if he, ok := err.(httpclient.HTTPError); ok {
		if he.Status == http.StatusNotFound {
			return core.ErrNotFound
		}
		sc := he.Status
		msg := string(he.Body)
		if len(msg) > 512 {
			msg = msg[:512] + "…"
		}
		return &core.ProviderError{Provider: core.ProviderBlaxel, StatusCode: &sc, Message: msg}
	}
	return err
}

func blaxelHTTPErr(code int, body []byte) error {
	sc := code
	msg := string(body)
	if len(msg) > 512 {
		msg = msg[:512] + "…"
	}
	return &core.ProviderError{Provider: core.ProviderBlaxel, StatusCode: &sc, Message: msg}
}
