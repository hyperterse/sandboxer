package providers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go/core"
	"github.com/hyperterse/sandboxer/sdks/go/core/httpclient"
)

func init() {
	core.RegisterProvider(core.ProviderRunloop, newRunloop)
}

const runloopDefaultAPI = "https://api.runloop.ai"

type runloopProvider struct {
	cfg   core.Config
	hc    *httpclient.Client
	token string
	base  string
}

func newRunloop(cfg core.Config) (core.Provider, error) {
	tok := runloopFirstNonEmpty(cfg.APIKey, os.Getenv("RUNLOOP_API_KEY"))
	if tok == "" {
		return nil, fmt.Errorf("%w: Runloop API key required (SANDBOXER_API_KEY or RUNLOOP_API_KEY)", core.ErrBadConfig)
	}
	hc, err := httpclient.New(cfg)
	if err != nil {
		return nil, err
	}
	b := cfg.BaseURL
	if b == "" {
		b = runloopDefaultAPI
	}
	return &runloopProvider{cfg: cfg, hc: hc, token: tok, base: strings.TrimRight(b, "/")}, nil
}

func (p *runloopProvider) Close() error { return nil }

func (p *runloopProvider) hdr() map[string]string {
	return map[string]string{"Authorization": "Bearer " + p.token}
}

func (p *runloopProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	if filter.Provider != nil && *filter.Provider != core.ProviderRunloop {
		return nil, nil
	}
	u := p.base + "/v1/devboxes?limit=5000"
	var page struct {
		Devboxes []struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"devboxes"`
	}
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.hdr(), nil, &page); err != nil {
		return nil, runloopMapErr(err)
	}
	out := make([]core.SandboxInfo, 0, len(page.Devboxes))
	for _, d := range page.Devboxes {
		st := mapStatus(d.Status)
		out = append(out, core.SandboxInfo{
			ID:        d.ID,
			Provider:  core.ProviderRunloop,
			Status:    st,
			StartedAt: time.Now(),
			Template:  nonEmptyPtr(d.Name),
		})
		if filter.Limit > 0 && len(out) >= filter.Limit {
			break
		}
	}
	return out, nil
}

func nonEmptyPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func mapStatus(s string) core.SandboxStatus {
	switch strings.ToLower(s) {
	case "suspended", "suspending":
		return core.SandboxPaused
	case "shutdown", "failure":
		return core.SandboxStopped
	case "provisioning", "initializing", "resuming":
		return core.SandboxStarting
	default:
		return core.SandboxRunning
	}
}

func (p *runloopProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	u := fmt.Sprintf("%s/v1/devboxes/%s/shutdown", p.base, url.PathEscape(sandboxID))
	_, err := p.hc.Do(ctx, http.MethodPost, u, p.hdr(), map[string]any{}, nil)
	return runloopMapErr(err)
}

func (p *runloopProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	if req.Provider != core.ProviderRunloop && req.Provider != "" {
		return nil, core.SandboxInfo{}, fmt.Errorf("%w: provider mismatch", core.ErrBadConfig)
	}
	body := map[string]any{}
	if req.Template != nil && *req.Template != "" {
		body["blueprint_name"] = *req.Template
	}
	if len(req.Envs) > 0 {
		body["environment_variables"] = req.Envs
	}
	if req.Metadata != nil {
		body["metadata"] = req.Metadata
	}
	var created struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	u := p.base + "/v1/devboxes"
	if _, err := p.hc.Do(ctx, http.MethodPost, u, p.hdr(), body, &created); err != nil {
		return nil, core.SandboxInfo{}, runloopMapErr(err)
	}
	sb := &runloopSandbox{p: p, id: created.ID}
	info := core.SandboxInfo{
		ID:        created.ID,
		Provider:  core.ProviderRunloop,
		Status:    mapStatus(created.Status),
		StartedAt: time.Now(),
	}
	if created.Name != "" {
		n := created.Name
		info.Template = &n
	} else if req.Template != nil {
		t := *req.Template
		info.Template = &t
	}
	return sb, info, nil
}

func (p *runloopProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	sb := &runloopSandbox{p: p, id: sandboxID}
	if _, err := sb.Info(ctx); err != nil {
		return nil, err
	}
	return sb, nil
}

type runloopSandbox struct {
	p  *runloopProvider
	id string
}

func (s *runloopSandbox) ID() string { return s.id }

func (s *runloopSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	u := fmt.Sprintf("%s/v1/devboxes/%s", s.p.base, url.PathEscape(s.id))
	var d struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.hdr(), nil, &d); err != nil {
		return core.SandboxInfo{}, runloopMapErr(err)
	}
	info := core.SandboxInfo{
		ID:        d.ID,
		Provider:  core.ProviderRunloop,
		Status:    mapStatus(d.Status),
		StartedAt: time.Now(),
	}
	if d.Name != "" {
		n := d.Name
		info.Template = &n
	}
	return info, nil
}

func (s *runloopSandbox) IsRunning(ctx context.Context) (bool, error) {
	i, err := s.Info(ctx)
	if err != nil {
		return false, err
	}
	return i.Status == core.SandboxRunning, nil
}

func (s *runloopSandbox) Pause(ctx context.Context) error {
	u := fmt.Sprintf("%s/v1/devboxes/%s/suspend", s.p.base, url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return runloopMapErr(err)
}

func (s *runloopSandbox) Resume(ctx context.Context) error {
	u := fmt.Sprintf("%s/v1/devboxes/%s/resume", s.p.base, url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return runloopMapErr(err)
}

func (s *runloopSandbox) Kill(ctx context.Context) error {
	return s.p.KillSandbox(ctx, s.id)
}

func (s *runloopSandbox) PortURL(ctx context.Context, port int) (string, error) {
	_ = ctx
	_ = port
	return "", core.ErrNotSupported
}

func (s *runloopSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	start := time.Now()
	u := fmt.Sprintf("%s/v1/devboxes/%s/execute_sync", s.p.base, url.PathEscape(s.id))
	body := map[string]any{"command": req.Cmd}
	if sn := os.Getenv("RUNLOOP_SHELL_NAME"); sn != "" {
		body["shell_name"] = sn
	}
	var out struct {
		Stdout     string `json:"stdout"`
		Stderr     string `json:"stderr"`
		ExitStatus int    `json:"exit_status"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), body, &out); err != nil {
		return core.CommandResult{}, runloopMapErr(err)
	}
	return core.CommandResult{
		Stdout:     out.Stdout,
		Stderr:     out.Stderr,
		ExitCode:   out.ExitStatus,
		DurationMs: core.ElapsedMillis(start),
	}, nil
}

func (s *runloopSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	_ = ctx
	_ = req
	return 0, "", core.ErrNotSupported
}

func (s *runloopSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	_ = ctx
	_ = handleID
	return core.CommandResult{}, core.ErrNotSupported
}

func (s *runloopSandbox) KillProcess(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *runloopSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func (s *runloopSandbox) ReadFile(ctx context.Context, path string) ([]byte, error) {
	u := fmt.Sprintf("%s/v1/devboxes/%s/read_file_contents", s.p.base, url.PathEscape(s.id))
	body := map[string]any{"file_path": path}
	var out struct {
		Contents string `json:"contents"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), body, &out); err != nil {
		return nil, runloopMapErr(err)
	}
	return []byte(out.Contents), nil
}

func (s *runloopSandbox) WriteFile(ctx context.Context, path string, content []byte, mode *int, user *string) error {
	_ = mode
	_ = user
	u := fmt.Sprintf("%s/v1/devboxes/%s/write_file_contents", s.p.base, url.PathEscape(s.id))
	body := map[string]any{"file_path": path, "contents": string(content)}
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), body, nil)
	return runloopMapErr(err)
}

func (s *runloopSandbox) ListDirectory(ctx context.Context, path string) ([]core.FileInfo, error) {
	res, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: "ls -1 " + runloopShellQuote(path)})
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		return nil, fmt.Errorf("ls failed: %s", res.Stderr)
	}
	var out []core.FileInfo
	for _, line := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		p := strings.TrimRight(path, "/") + "/" + line
		out = append(out, core.FileInfo{Name: line, Path: p})
	}
	return out, nil
}

func (s *runloopSandbox) MakeDir(ctx context.Context, path string) error {
	_, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: "mkdir -p " + runloopShellQuote(path)})
	return err
}

func (s *runloopSandbox) Remove(ctx context.Context, path string) error {
	_, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: "rm -rf " + runloopShellQuote(path)})
	return err
}

func (s *runloopSandbox) Exists(ctx context.Context, path string) (bool, error) {
	res, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: "test -e " + runloopShellQuote(path) + " && echo yes || echo no"})
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(res.Stdout) == "yes", nil
}

func runloopShellQuote(p string) string {
	return `'` + strings.ReplaceAll(p, `'`, `'"'"'`) + `'`
}

func (s *runloopSandbox) CreatePTY(ctx context.Context, req core.CreatePTYRequest) (core.PTYInfo, error) {
	_ = ctx
	_ = req
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *runloopSandbox) ResizePTY(ctx context.Context, pid int, rows, cols int) error {
	_ = ctx
	_ = pid
	_ = rows
	_ = cols
	return core.ErrNotSupported
}

func (s *runloopSandbox) KillPTY(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *runloopSandbox) ListPTY(ctx context.Context) ([]core.PTYInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func runloopFirstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func runloopMapErr(err error) error {
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
		return &core.ProviderError{Provider: core.ProviderRunloop, StatusCode: &sc, Message: msg}
	}
	return err
}
