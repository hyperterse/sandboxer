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
	core.RegisterProvider(core.ProviderFlyMachines, newFlyMachines)
}

const flyDefaultAPI = "https://api.machines.dev"

type flyMachinesProvider struct {
	cfg   core.Config
	hc    *httpclient.Client
	token string
	base  string
	app   string
}

func newFlyMachines(cfg core.Config) (core.Provider, error) {
	tok := flyFirstNonEmpty(cfg.APIKey, os.Getenv("FLY_API_TOKEN"))
	if tok == "" {
		return nil, fmt.Errorf("%w: Fly API token required (SANDBOXER_API_KEY or FLY_API_TOKEN)", core.ErrBadConfig)
	}
	app := os.Getenv("FLY_APP_NAME")
	if app == "" {
		app = os.Getenv("SANDBOXER_FLY_APP")
	}
	if app == "" {
		return nil, fmt.Errorf("%w: set FLY_APP_NAME or SANDBOXER_FLY_APP", core.ErrBadConfig)
	}
	hc, err := httpclient.New(cfg)
	if err != nil {
		return nil, err
	}
	b := cfg.BaseURL
	if b == "" {
		b = os.Getenv("FLY_API_HOSTNAME")
	}
	if b == "" {
		b = flyDefaultAPI
	}
	return &flyMachinesProvider{cfg: cfg, hc: hc, token: tok, base: strings.TrimRight(b, "/"), app: app}, nil
}

func (p *flyMachinesProvider) Close() error { return nil }

func (p *flyMachinesProvider) hdr() map[string]string {
	return map[string]string{"Authorization": "Bearer " + p.token}
}

func (p *flyMachinesProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	if filter.Provider != nil && *filter.Provider != core.ProviderFlyMachines {
		return nil, nil
	}
	u := fmt.Sprintf("%s/v1/apps/%s/machines", p.base, url.PathEscape(p.app))
	var wrap struct {
		Machines []struct {
			ID     string `json:"id"`
			State  string `json:"state"`
			Region string `json:"region"`
		} `json:"machines"`
	}
	if _, err := p.hc.Do(ctx, http.MethodGet, u, p.hdr(), nil, &wrap); err != nil {
		return nil, flyMapErr(err)
	}
	out := make([]core.SandboxInfo, 0, len(wrap.Machines))
	for _, m := range wrap.Machines {
		st := core.SandboxRunning
		if strings.EqualFold(m.State, "stopped") || strings.EqualFold(m.State, "destroyed") {
			st = core.SandboxStopped
		}
		out = append(out, core.SandboxInfo{
			ID:        m.ID,
			Provider:  core.ProviderFlyMachines,
			Status:    st,
			StartedAt: time.Now(),
			Metadata:  map[string]string{"region": m.Region, "app": p.app},
		})
		if filter.Limit > 0 && len(out) >= filter.Limit {
			break
		}
	}
	return out, nil
}

func (p *flyMachinesProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	u := fmt.Sprintf("%s/v1/apps/%s/machines/%s?force=true", p.base, url.PathEscape(p.app), url.PathEscape(sandboxID))
	_, err := p.hc.Do(ctx, http.MethodDelete, u, p.hdr(), nil, nil)
	return flyMapErr(err)
}

func (p *flyMachinesProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	if req.Provider != core.ProviderFlyMachines && req.Provider != "" {
		return nil, core.SandboxInfo{}, fmt.Errorf("%w: provider mismatch", core.ErrBadConfig)
	}
	image := "nginx:alpine"
	if req.Template != nil && *req.Template != "" {
		image = *req.Template
	}
	cpus := 1
	mem := 256
	if req.CPUs != nil {
		cpus = *req.CPUs
	}
	if req.MemoryMb != nil {
		mem = *req.MemoryMb
	}
	body := map[string]any{
		"config": map[string]any{
			"image": image,
			"guest": map[string]any{
				"cpu_kind":  "shared",
				"cpus":      cpus,
				"memory_mb": mem,
			},
			"auto_destroy":        true,
			"auto_start_machines": true,
			"restart":             map[string]any{"policy": "no"},
			"stop_timeout":        "60s",
			"env":                 req.Envs,
			"metadata":            req.Metadata,
		},
		"region": flyFirstNonEmpty(os.Getenv("FLY_REGION"), "iad"),
	}
	u := fmt.Sprintf("%s/v1/apps/%s/machines", p.base, url.PathEscape(p.app))
	var created struct {
		ID string `json:"id"`
	}
	if _, err := p.hc.Do(ctx, http.MethodPost, u, p.hdr(), body, &created); err != nil {
		return nil, core.SandboxInfo{}, flyMapErr(err)
	}
	sb := &flyMachinesSandbox{p: p, id: created.ID}
	info := core.SandboxInfo{
		ID:        created.ID,
		Provider:  core.ProviderFlyMachines,
		Status:    core.SandboxStarting,
		StartedAt: time.Now(),
		Template:  &image,
		Metadata:  map[string]string{"app": p.app},
		CPUs:      &cpus,
		MemoryMb:  &mem,
	}
	return sb, info, nil
}

func (p *flyMachinesProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	sb := &flyMachinesSandbox{p: p, id: sandboxID}
	if _, err := sb.Info(ctx); err != nil {
		return nil, err
	}
	return sb, nil
}

type flyMachinesSandbox struct {
	p  *flyMachinesProvider
	id string
}

func (s *flyMachinesSandbox) ID() string { return s.id }

func (s *flyMachinesSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	u := fmt.Sprintf("%s/v1/apps/%s/machines/%s", s.p.base, url.PathEscape(s.p.app), url.PathEscape(s.id))
	var m struct {
		ID     string `json:"id"`
		State  string `json:"state"`
		Config struct {
			Image string `json:"image"`
			Guest struct {
				CPUs     int `json:"cpus"`
				MemoryMB int `json:"memory_mb"`
			} `json:"guest"`
		} `json:"config"`
	}
	if _, err := s.p.hc.Do(ctx, http.MethodGet, u, s.p.hdr(), nil, &m); err != nil {
		return core.SandboxInfo{}, flyMapErr(err)
	}
	st := core.SandboxRunning
	if strings.EqualFold(m.State, "stopped") {
		st = core.SandboxStopped
	}
	info := core.SandboxInfo{
		ID:        m.ID,
		Provider:  core.ProviderFlyMachines,
		Status:    st,
		StartedAt: time.Now(),
		Metadata:  map[string]string{"app": s.p.app},
	}
	if m.Config.Image != "" {
		im := m.Config.Image
		info.Template = &im
	}
	if m.Config.Guest.CPUs > 0 {
		c := m.Config.Guest.CPUs
		info.CPUs = &c
	}
	if m.Config.Guest.MemoryMB > 0 {
		mb := m.Config.Guest.MemoryMB
		info.MemoryMb = &mb
	}
	return info, nil
}

func (s *flyMachinesSandbox) IsRunning(ctx context.Context) (bool, error) {
	i, err := s.Info(ctx)
	if err != nil {
		return false, err
	}
	return i.Status == core.SandboxRunning, nil
}

func (s *flyMachinesSandbox) Pause(ctx context.Context) error {
	u := fmt.Sprintf("%s/v1/apps/%s/machines/%s/suspend", s.p.base, url.PathEscape(s.p.app), url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return flyMapErr(err)
}

func (s *flyMachinesSandbox) Resume(ctx context.Context) error {
	u := fmt.Sprintf("%s/v1/apps/%s/machines/%s/start", s.p.base, url.PathEscape(s.p.app), url.PathEscape(s.id))
	_, err := s.p.hc.Do(ctx, http.MethodPost, u, s.p.hdr(), map[string]any{}, nil)
	return flyMapErr(err)
}

func (s *flyMachinesSandbox) Kill(ctx context.Context) error {
	return s.p.KillSandbox(ctx, s.id)
}

func (s *flyMachinesSandbox) PortURL(ctx context.Context, port int) (string, error) {
	_ = ctx
	_ = port
	return "", core.ErrNotSupported
}

func (s *flyMachinesSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	_ = ctx
	_ = req
	return core.CommandResult{}, core.ErrNotSupported
}

func (s *flyMachinesSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	_ = ctx
	_ = req
	return 0, "", core.ErrNotSupported
}

func (s *flyMachinesSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	_ = ctx
	_ = handleID
	return core.CommandResult{}, core.ErrNotSupported
}

func (s *flyMachinesSandbox) KillProcess(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func (s *flyMachinesSandbox) ReadFile(ctx context.Context, path string) ([]byte, error) {
	_ = ctx
	_ = path
	return nil, core.ErrNotSupported
}

func (s *flyMachinesSandbox) WriteFile(ctx context.Context, path string, content []byte, mode *int, user *string) error {
	_ = ctx
	_ = path
	_ = content
	_ = mode
	_ = user
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) ListDirectory(ctx context.Context, path string) ([]core.FileInfo, error) {
	_ = ctx
	_ = path
	return nil, core.ErrNotSupported
}

func (s *flyMachinesSandbox) MakeDir(ctx context.Context, path string) error {
	_ = ctx
	_ = path
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) Remove(ctx context.Context, path string) error {
	_ = ctx
	_ = path
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) Exists(ctx context.Context, path string) (bool, error) {
	_ = ctx
	_ = path
	return false, core.ErrNotSupported
}

func (s *flyMachinesSandbox) CreatePTY(ctx context.Context, req core.CreatePTYRequest) (core.PTYInfo, error) {
	_ = ctx
	_ = req
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *flyMachinesSandbox) ResizePTY(ctx context.Context, pid int, rows, cols int) error {
	_ = ctx
	_ = pid
	_ = rows
	_ = cols
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) KillPTY(ctx context.Context, pid int) error {
	_ = ctx
	_ = pid
	return core.ErrNotSupported
}

func (s *flyMachinesSandbox) ListPTY(ctx context.Context) ([]core.PTYInfo, error) {
	_ = ctx
	return nil, core.ErrNotSupported
}

func flyFirstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func flyMapErr(err error) error {
	if err == nil {
		return nil
	}
	if he, ok := err.(httpclient.HTTPError); ok {
		if he.Status == http.StatusNotFound {
			return core.ErrNotFound
		}
		sc := he.Status
		msg := string(he.Body)
		if len(msg) > 400 {
			msg = msg[:400] + "…"
		}
		return &core.ProviderError{Provider: core.ProviderFlyMachines, StatusCode: &sc, Message: msg}
	}
	return err
}
