package providers

import (
	"bytes"
	"context"
	"encoding/base64"
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
	"github.com/hyperterse/sandboxer/sdks/go/core/connectproto"
	"github.com/hyperterse/sandboxer/sdks/go/core/httpclient"
)

func init() {
	core.RegisterProvider(core.ProviderE2B, newE2B)
}

const (
	defaultAPIBase    = "https://api.e2b.app"
	defaultEnvdPort   = 49983
	headerAPIKey      = "X-API-Key"
	headerAccessToken = "X-Access-Token"
)

// e2bProvider implements the E2B REST + envd Connect/JSON APIs.
type e2bProvider struct {
	cfg     core.Config
	hc      *httpclient.Client
	apiKey  string
	apiBase string
	port    int
	tpl     string
}

// newE2B constructs an E2B provider.
func newE2B(cfg core.Config) (core.Provider, error) {
	key := e2bFirstNonEmpty(cfg.APIKey, os.Getenv("E2B_API_KEY"))
	if key == "" {
		return nil, fmt.Errorf("%w: E2B API key required (SANDBOXER_API_KEY or E2B_API_KEY)", core.ErrBadConfig)
	}
	hc, err := httpclient.New(cfg)
	if err != nil {
		return nil, err
	}
	base := cfg.BaseURL
	if base == "" {
		base = defaultAPIBase
	}
	port := defaultEnvdPort
	if p := os.Getenv("E2B_ENVD_PORT"); p != "" {
		if n, err := strconv.Atoi(p); err == nil {
			port = n
		}
	}
	tpl := os.Getenv("E2B_TEMPLATE_ID")
	if tpl == "" {
		tpl = "base"
	}
	return &e2bProvider{
		cfg:     cfg,
		hc:      hc,
		apiKey:  key,
		apiBase: strings.TrimRight(base, "/"),
		port:    port,
		tpl:     tpl,
	}, nil
}

func (p *e2bProvider) Close() error { return nil }

func (p *e2bProvider) apiHeaders() map[string]string {
	return map[string]string{headerAPIKey: p.apiKey}
}

func (p *e2bProvider) envdBase(sandboxID string) string {
	return fmt.Sprintf("https://%d-%s.e2b.app", p.port, sandboxID)
}

func (p *e2bProvider) envdHeaders(tok *string) map[string]string {
	h := map[string]string{}
	if tok != nil && *tok != "" {
		h[headerAccessToken] = *tok
	}
	return h
}

func (p *e2bProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	if filter.Provider != nil && *filter.Provider != core.ProviderE2B {
		return nil, nil
	}
	u := p.apiBase + "/v2/sandboxes"
	if filter.Limit > 0 {
		u += "?limit=" + strconv.Itoa(filter.Limit)
	}
	var listed []struct {
		TemplateID string            `json:"templateID"`
		SandboxID  string            `json:"sandboxID"`
		StartedAt  string            `json:"startedAt"`
		EndAt      string            `json:"endAt"`
		State      string            `json:"state"`
		Metadata   map[string]string `json:"metadata"`
		CPUs       int               `json:"cpuCount"`
		MemoryMB   int               `json:"memoryMB"`
	}
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.apiHeaders(), nil, &listed); err != nil {
		return nil, e2bMapErr(core.ProviderE2B, err)
	}
	out := make([]core.SandboxInfo, 0, len(listed))
	for _, s := range listed {
		if filter.MetadataFilter != "" && !metadataMatch(s.Metadata, filter.MetadataFilter) {
			continue
		}
		info := core.SandboxInfo{
			ID:       s.SandboxID,
			Provider: core.ProviderE2B,
			Status:   core.SandboxRunning,
			Metadata: s.Metadata,
		}
		t := s.TemplateID
		info.Template = &t
		if s.State == "paused" {
			info.Status = core.SandboxPaused
		}
		if ts, err := time.Parse(time.RFC3339, s.StartedAt); err == nil {
			info.StartedAt = ts
		}
		if s.EndAt != "" {
			if exp, err := time.Parse(time.RFC3339, s.EndAt); err == nil {
				info.ExpiresAt = &exp
			}
		}
		if s.CPUs > 0 {
			info.CPUs = &s.CPUs
		}
		if s.MemoryMB > 0 {
			info.MemoryMb = &s.MemoryMB
		}
		out = append(out, info)
	}
	return out, nil
}

func metadataMatch(m map[string]string, needle string) bool {
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

func (p *e2bProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	u := fmt.Sprintf("%s/sandboxes/%s", p.apiBase, url.PathEscape(sandboxID))
	_, err := p.hc.Do(ctx, http.MethodDelete, u, p.apiHeaders(), nil, nil)
	return e2bMapErr(core.ProviderE2B, err)
}

func (p *e2bProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	if req.Provider != core.ProviderE2B && req.Provider != "" {
		return nil, core.SandboxInfo{}, fmt.Errorf("%w: provider mismatch", core.ErrBadConfig)
	}
	tpl := p.tpl
	if req.Template != nil && *req.Template != "" {
		tpl = *req.Template
	}
	body := map[string]any{
		"templateID": tpl,
		"metadata":   req.Metadata,
		"envVars":    req.Envs,
	}
	if req.TimeoutSeconds != nil {
		body["timeout"] = *req.TimeoutSeconds
	}
	if req.CPUs != nil {
		body["cpuCount"] = *req.CPUs
	}
	if req.MemoryMb != nil {
		body["memoryMB"] = *req.MemoryMb
	}
	var created struct {
		SandboxID          string  `json:"sandboxID"`
		TemplateID         string  `json:"templateID"`
		EnvdAccessToken    *string `json:"envdAccessToken"`
		TrafficAccessToken *string `json:"trafficAccessToken"`
	}
	u := p.apiBase + "/sandboxes"
	if _, err := p.hc.Do(ctx, http.MethodPost, u, p.apiHeaders(), body, &created); err != nil {
		return nil, core.SandboxInfo{}, e2bMapErr(core.ProviderE2B, err)
	}
	detail, err := p.getSandboxDetail(ctx, created.SandboxID)
	if err != nil {
		return nil, core.SandboxInfo{}, err
	}
	info := detail.toInfo(tpl, created.EnvdAccessToken)
	sb := &e2bSandbox{provider: p, id: created.SandboxID, token: created.EnvdAccessToken}
	return sb, info, nil
}

func (p *e2bProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	detail, err := p.getSandboxDetail(ctx, sandboxID)
	if err != nil {
		return nil, err
	}
	return &e2bSandbox{
		provider: p,
		id:       sandboxID,
		token:    detail.EnvdAccessToken,
	}, nil
}

type e2bSandboxDetail struct {
	SandboxID       string            `json:"sandboxID"`
	TemplateID      string            `json:"templateID"`
	StartedAt       string            `json:"startedAt"`
	EndAt           string            `json:"endAt"`
	State           string            `json:"state"`
	Metadata        map[string]string `json:"metadata"`
	CPUCount        int               `json:"cpuCount"`
	MemoryMB        int               `json:"memoryMB"`
	EnvdAccessToken *string           `json:"envdAccessToken"`
}

func (d *e2bSandboxDetail) toInfo(fallbackTpl string, tok *string) core.SandboxInfo {
	tpl := d.TemplateID
	if tpl == "" {
		tpl = fallbackTpl
	}
	st := core.SandboxRunning
	if d.State == "paused" {
		st = core.SandboxPaused
	}
	info := core.SandboxInfo{
		ID:        d.SandboxID,
		Provider:  core.ProviderE2B,
		Template:  &tpl,
		Status:    st,
		Metadata:  d.Metadata,
		StartedAt: time.Now(),
	}
	if ts, err := time.Parse(time.RFC3339, d.StartedAt); err == nil {
		info.StartedAt = ts
	}
	if d.EndAt != "" {
		if exp, err := time.Parse(time.RFC3339, d.EndAt); err == nil {
			info.ExpiresAt = &exp
		}
	}
	if d.CPUCount > 0 {
		info.CPUs = &d.CPUCount
	}
	if d.MemoryMB > 0 {
		info.MemoryMb = &d.MemoryMB
	}
	_ = tok
	return info
}

func (p *e2bProvider) getSandboxDetail(ctx context.Context, id string) (*e2bSandboxDetail, error) {
	u := fmt.Sprintf("%s/sandboxes/%s", p.apiBase, url.PathEscape(id))
	var d e2bSandboxDetail
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.apiHeaders(), nil, &d); err != nil {
		return nil, e2bMapErr(core.ProviderE2B, err)
	}
	return &d, nil
}

type e2bSandbox struct {
	provider *e2bProvider
	id       string
	token    *string
}

func (s *e2bSandbox) ID() string { return s.id }

func (s *e2bSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	d, err := s.provider.getSandboxDetail(ctx, s.id)
	if err != nil {
		return core.SandboxInfo{}, err
	}
	return d.toInfo(s.provider.tpl, s.token), nil
}

func (s *e2bSandbox) IsRunning(ctx context.Context) (bool, error) {
	d, err := s.provider.getSandboxDetail(ctx, s.id)
	if err != nil {
		return false, err
	}
	return d.State == "running", nil
}

func (s *e2bSandbox) Pause(ctx context.Context) error {
	u := fmt.Sprintf("%s/sandboxes/%s/pause", s.provider.apiBase, url.PathEscape(s.id))
	_, err := s.provider.hc.Do(ctx, http.MethodPost, u, s.provider.apiHeaders(), map[string]any{}, nil)
	return e2bMapErr(core.ProviderE2B, err)
}

func (s *e2bSandbox) Resume(ctx context.Context) error {
	u := fmt.Sprintf("%s/sandboxes/%s/resume", s.provider.apiBase, url.PathEscape(s.id))
	_, err := s.provider.hc.Do(ctx, http.MethodPost, u, s.provider.apiHeaders(), map[string]any{}, nil)
	return e2bMapErr(core.ProviderE2B, err)
}

func (s *e2bSandbox) Kill(ctx context.Context) error {
	return s.provider.KillSandbox(ctx, s.id)
}

func (s *e2bSandbox) PortURL(ctx context.Context, port int) (string, error) {
	_ = ctx
	return fmt.Sprintf("https://%d-%s.e2b.app", port, s.id), nil
}

func (s *e2bSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	start := time.Now()
	u := s.provider.envdBase(s.id) + "/process.Process/Start"
	h := s.provider.envdHeaders(s.token)
	if req.TimeoutSeconds != nil && *req.TimeoutSeconds > 0 {
		h[connectproto.HeaderTimeoutMs] = strconv.Itoa(*req.TimeoutSeconds * 1000)
	}
	proc := map[string]any{
		"cmd":  "sh",
		"args": []string{"-c", req.Cmd},
		"envs": req.Env,
	}
	if req.Cwd != nil {
		proc["cwd"] = *req.Cwd
	}
	body := map[string]any{"process": proc}
	var stdout, stderr strings.Builder
	exit := 0
	sawEnd := false
	err := connectproto.StreamPOST(ctx, s.provider.hc, u, h, body, func(msg json.RawMessage) error {
		var wrap struct {
			Event json.RawMessage `json:"event"`
		}
		if err := json.Unmarshal(msg, &wrap); err != nil {
			return nil
		}
		var ev map[string]json.RawMessage
		if err := json.Unmarshal(wrap.Event, &ev); err != nil {
			return nil
		}
		if data, ok := ev["data"]; ok {
			var dm map[string]json.RawMessage
			_ = json.Unmarshal(data, &dm)
			appendB64(&stdout, dm["stdout"])
			appendB64(&stderr, dm["stderr"])
		}
		if end, ok := ev["end"]; ok {
			var em struct {
				ExitCode  int `json:"exit_code"`
				ExitCode2 int `json:"exitCode"`
			}
			_ = json.Unmarshal(end, &em)
			if em.ExitCode2 != 0 {
				exit = em.ExitCode2
			} else {
				exit = em.ExitCode
			}
			sawEnd = true
		}
		return nil
	})
	if err != nil {
		return core.CommandResult{}, err
	}
	if !sawEnd {
		exit = -1
	}
	return core.CommandResult{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exit,
		DurationMs: core.ElapsedMillis(start),
	}, nil
}

func appendB64(w *strings.Builder, raw json.RawMessage) {
	if len(raw) < 2 {
		return
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return
	}
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		w.WriteString(s)
		return
	}
	w.Write(b)
}

func (s *e2bSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	_ = ctx
	_ = req
	return 0, "", core.ErrNotSupported
}

func (s *e2bSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	_ = ctx
	_ = handleID
	return core.CommandResult{}, core.ErrNotSupported
}

func (s *e2bSandbox) KillProcess(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *e2bSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func (s *e2bSandbox) ReadFile(ctx context.Context, path string) ([]byte, error) {
	u := s.provider.envdBase(s.id) + "/files?path=" + url.QueryEscape(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range s.provider.envdHeaders(s.token) {
		req.Header.Set(k, v)
	}
	resp, err := s.provider.hc.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, core.ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return nil, e2bHTTPErr(core.ProviderE2B, resp.StatusCode, b)
	}
	return b, nil
}

func (s *e2bSandbox) WriteFile(ctx context.Context, pth string, content []byte, mode *int, user *string) error {
	_ = mode
	_ = user
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("path", pth)
	w, err := mw.CreateFormFile("file", "blob")
	if err != nil {
		return err
	}
	if _, err := w.Write(content); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}
	u := s.provider.envdBase(s.id) + "/files"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range s.provider.envdHeaders(s.token) {
		req.Header.Set(k, v)
	}
	resp, err := s.provider.hc.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return e2bHTTPErr(core.ProviderE2B, resp.StatusCode, raw)
	}
	return nil
}

func (s *e2bSandbox) ListDirectory(ctx context.Context, path string) ([]core.FileInfo, error) {
	u := s.provider.envdBase(s.id) + "/filesystem.Filesystem/ListDir"
	h := s.provider.envdHeaders(s.token)
	var out struct {
		Entries []struct {
			Name string `json:"name"`
			Path string `json:"path"`
			Type string `json:"type"`
			Size any    `json:"size"`
			Mode int    `json:"mode"`
		} `json:"entries"`
	}
	if err := connectproto.UnaryPost(ctx, s.provider.hc, u, h, map[string]any{"path": path, "depth": 1}, &out); err != nil {
		return nil, err
	}
	res := make([]core.FileInfo, 0, len(out.Entries))
	for _, e := range out.Entries {
		fi := core.FileInfo{Name: e.Name, Path: e.Path, IsDir: strings.Contains(e.Type, "DIRECTORY")}
		switch v := e.Size.(type) {
		case float64:
			fi.Size = int64(v)
		case string:
			fi.Size, _ = strconv.ParseInt(v, 10, 64)
		}
		if e.Mode != 0 {
			m := e.Mode
			fi.Mode = &m
		}
		res = append(res, fi)
	}
	return res, nil
}

func (s *e2bSandbox) MakeDir(ctx context.Context, path string) error {
	u := s.provider.envdBase(s.id) + "/filesystem.Filesystem/MakeDir"
	h := s.provider.envdHeaders(s.token)
	var discard any
	return connectproto.UnaryPost(ctx, s.provider.hc, u, h, map[string]any{"path": path}, &discard)
}

func (s *e2bSandbox) Remove(ctx context.Context, path string) error {
	_, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: "rm -rf " + e2bShellQuote(path)})
	return err
}

func (s *e2bSandbox) Exists(ctx context.Context, path string) (bool, error) {
	u := s.provider.envdBase(s.id) + "/files?path=" + url.QueryEscape(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	for k, v := range s.provider.envdHeaders(s.token) {
		req.Header.Set(k, v)
	}
	resp, err := s.provider.hc.HTTP.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, e2bHTTPErr(core.ProviderE2B, resp.StatusCode, raw)
	}
	return true, nil
}

func e2bShellQuote(p string) string {
	return `'` + strings.ReplaceAll(p, `'`, `'"'"'`) + `'`
}

func (s *e2bSandbox) CreatePTY(ctx context.Context, req core.CreatePTYRequest) (core.PTYInfo, error) {
	_ = ctx
	_ = req
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *e2bSandbox) ResizePTY(ctx context.Context, pid int, rows, cols int) error {
	_ = ctx
	_ = pid
	_ = rows
	_ = cols
	return core.ErrNotSupported
}

func (s *e2bSandbox) KillPTY(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *e2bSandbox) ListPTY(ctx context.Context) ([]core.PTYInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func e2bFirstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func e2bMapErr(name core.ProviderName, err error) error {
	if err == nil {
		return nil
	}
	if he, ok := err.(httpclient.HTTPError); ok {
		if he.Status == http.StatusNotFound {
			return core.ErrNotFound
		}
		return e2bHTTPErr(name, he.Status, he.Body)
	}
	return err
}

func e2bHTTPErr(name core.ProviderName, code int, body []byte) error {
	msg := strings.TrimSpace(string(body))
	if len(msg) > 256 {
		msg = msg[:256] + "…"
	}
	sc := code
	return &core.ProviderError{Provider: name, StatusCode: &sc, Message: msg}
}
