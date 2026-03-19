package providers

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"path"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go/core"
)

func init() {
	core.RegisterProvider(core.ProviderLocal, newLocal)
}

const (
	labelManaged  = "sandboxer.managed"
	labelProvider = "sandboxer.provider"
)

// newLocal builds a Provider that shells out to the docker CLI.
func newLocal(cfg core.Config) (core.Provider, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return nil, fmt.Errorf("%w: docker CLI not found in PATH", core.ErrBadConfig)
	}
	if err := dockerOK(context.Background()); err != nil {
		return nil, err
	}
	return &localProvider{cfg: cfg}, nil
}

func dockerOK(ctx context.Context) error {
	cmd := exec.CommandContext(ctx, "docker", "info")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: docker info: %v: %s", core.ErrBadConfig, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func dockerJSON(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: docker %v: %v: %s", core.ErrBadConfig, args, err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

// localProvider implements core.Provider via the docker CLI.
type localProvider struct {
	cfg core.Config
}

func (p *localProvider) Close() error { return nil }

func (p *localProvider) ListSandboxes(ctx context.Context, filter core.ListSandboxesFilter) ([]core.SandboxInfo, error) {
	args := []string{"ps", "-a", "-q", "--no-trunc", "--filter", "label=" + labelManaged + "=true"}
	raw, err := dockerJSON(ctx, args...)
	if err != nil {
		return nil, err
	}
	if filter.Provider != nil && *filter.Provider != core.ProviderLocal {
		return nil, nil
	}
	ids := strings.Fields(strings.TrimSpace(string(raw)))
	out := make([]core.SandboxInfo, 0, len(ids))
	for _, id := range ids {
		info, err := p.inspect(ctx, id)
		if err != nil {
			continue
		}
		if filter.MetadataFilter != "" && !metadataContains(info.Metadata, filter.MetadataFilter) {
			continue
		}
		out = append(out, info)
		if filter.Limit > 0 && len(out) >= filter.Limit {
			break
		}
	}
	return out, nil
}

func metadataContains(m map[string]string, needle string) bool {
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

func (p *localProvider) KillSandbox(ctx context.Context, sandboxID string) error {
	_, err := dockerJSON(ctx, "rm", "-f", sandboxID)
	if err != nil {
		return providerErr(err)
	}
	return nil
}

func (p *localProvider) CreateSandbox(ctx context.Context, req core.CreateSandboxRequest) (core.Sandbox, core.SandboxInfo, error) {
	if req.Provider != core.ProviderLocal && req.Provider != "" {
		return nil, core.SandboxInfo{}, fmt.Errorf("%w: provider mismatch", core.ErrBadConfig)
	}
	image := "alpine:latest"
	if req.Template != nil && *req.Template != "" {
		image = *req.Template
	}
	args := []string{"create", "--label", labelManaged + "=true", "--label", labelProvider + "=" + string(core.ProviderLocal)}
	for k, v := range req.Metadata {
		args = append(args, "--label", "sandboxer.meta."+sanitizeLabelKey(k)+"="+v)
	}
	if len(req.Envs) > 0 {
		for k, v := range req.Envs {
			args = append(args, "-e", k+"="+v)
		}
	}
	if req.CPUs != nil && *req.CPUs > 0 {
		args = append(args, "--cpus", fmt.Sprintf("%d", *req.CPUs))
	}
	if req.MemoryMb != nil && *req.MemoryMb > 0 {
		args = append(args, "-m", fmt.Sprintf("%dm", *req.MemoryMb))
	}
	args = append(args, image, "sleep", "infinity")
	out, err := dockerJSON(ctx, args...)
	if err != nil {
		return nil, core.SandboxInfo{}, providerErr(err)
	}
	id := strings.TrimSpace(string(out))
	if _, err := dockerJSON(ctx, "start", id); err != nil {
		_, _ = dockerJSON(ctx, "rm", "-f", id)
		return nil, core.SandboxInfo{}, providerErr(err)
	}
	info, err := p.inspect(ctx, id)
	if err != nil {
		return nil, core.SandboxInfo{}, err
	}
	return newLocalSandbox(id), info, nil
}

func (p *localProvider) AttachSandbox(ctx context.Context, sandboxID string) (core.Sandbox, error) {
	info, err := p.inspect(ctx, sandboxID)
	if err != nil {
		return nil, err
	}
	if info.Status != core.SandboxRunning {
		return nil, core.ErrNotFound
	}
	return newLocalSandbox(sandboxID), nil
}

func (p *localProvider) inspect(ctx context.Context, id string) (core.SandboxInfo, error) {
	raw, err := dockerJSON(ctx, "inspect", id)
	if err != nil {
		if strings.Contains(err.Error(), "No such object") {
			return core.SandboxInfo{}, core.ErrNotFound
		}
		return core.SandboxInfo{}, providerErr(err)
	}
	var wrap []struct {
		Id      string `json:"Id"`
		Created string `json:"Created"`
		Config  struct {
			Image  string            `json:"Image"`
			Labels map[string]string `json:"Labels"`
		} `json:"Config"`
		State struct {
			Running    bool   `json:"Running"`
			Paused     bool   `json:"Paused"`
			Status     string `json:"Status"`
			StartedAt  string `json:"StartedAt"`
			FinishedAt string `json:"FinishedAt"`
			OOMKilled  bool   `json:"OOMKilled"`
			ExitCode   int    `json:"ExitCode"`
		} `json:"State"`
		NetworkSettings struct {
			Ports map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"Ports"`
		} `json:"NetworkSettings"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil || len(wrap) == 0 {
		if err != nil {
			return core.SandboxInfo{}, providerErr(err)
		}
		return core.SandboxInfo{}, core.ErrNotFound
	}
	in := wrap[0]
	if in.Config.Labels[labelManaged] != "true" {
		return core.SandboxInfo{}, core.ErrNotFound
	}
	st := core.SandboxStopped
	switch {
	case in.State.Running:
		st = core.SandboxRunning
	case in.State.Paused:
		st = core.SandboxPaused
	case in.State.Status == "created" || in.State.Status == "restarting":
		st = core.SandboxStarting
	case in.State.OOMKilled || in.State.ExitCode != 0:
		st = core.SandboxError
	}
	meta := map[string]string{}
	for k, v := range in.Config.Labels {
		if strings.HasPrefix(k, "sandboxer.meta.") {
			meta[strings.TrimPrefix(k, "sandboxer.meta.")] = v
		}
	}
	started := time.Now().UTC()
	if in.State.StartedAt != "" {
		if t, err := time.Parse(time.RFC3339Nano, in.State.StartedAt); err == nil {
			started = t.UTC()
		}
	}
	tmpl := in.Config.Image
	return core.SandboxInfo{
		ID:        in.Id,
		Provider:  core.ProviderLocal,
		Template:  &tmpl,
		Status:    st,
		StartedAt: started,
		Metadata:  meta,
	}, nil
}

func sanitizeLabelKey(k string) string {
	k = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '_', r == '-':
			return r
		default:
			return '_'
		}
	}, k)
	if k == "" {
		return "key"
	}
	return k
}

func providerErr(err error) error {
	if err == nil {
		return nil
	}
	return &core.ProviderError{Provider: core.ProviderLocal, Message: err.Error()}
}

type localSandbox struct {
	id      string
	pidSeq  atomic.Int64
	handles sync.Map
}

type asyncOutcome struct {
	res core.CommandResult
	err error
}

func newLocalSandbox(id string) *localSandbox {
	return &localSandbox{id: strings.TrimSpace(id)}
}

func (s *localSandbox) ID() string { return s.id }

func (s *localSandbox) Info(ctx context.Context) (core.SandboxInfo, error) {
	p := &localProvider{}
	return p.inspect(ctx, s.id)
}

func (s *localSandbox) IsRunning(ctx context.Context) (bool, error) {
	info, err := s.Info(ctx)
	if err != nil {
		return false, err
	}
	return info.Status == core.SandboxRunning, nil
}

func (s *localSandbox) Pause(ctx context.Context) error {
	_, err := dockerJSON(ctx, "pause", s.id)
	return mapDockerErr(err)
}

func (s *localSandbox) Resume(ctx context.Context) error {
	_, err := dockerJSON(ctx, "unpause", s.id)
	return mapDockerErr(err)
}

func (s *localSandbox) Kill(ctx context.Context) error {
	_, err := dockerJSON(ctx, "rm", "-f", s.id)
	return mapDockerErr(err)
}

func (s *localSandbox) PortURL(ctx context.Context, port int) (string, error) {
	raw, err := dockerJSON(ctx, "inspect", s.id)
	if err != nil {
		return "", mapDockerErr(err)
	}
	var wrap []struct {
		NetworkSettings struct {
			Ports map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"Ports"`
		} `json:"NetworkSettings"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil || len(wrap) == 0 {
		return "", providerErr(err)
	}
	key := fmt.Sprintf("%d/tcp", port)
	binds, ok := wrap[0].NetworkSettings.Ports[key]
	if !ok || len(binds) == 0 {
		return "", core.ErrNotSupported
	}
	hostIP := binds[0].HostIP
	if hostIP == "" || hostIP == "0.0.0.0" {
		hostIP = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%s", hostIP, binds[0].HostPort), nil
}

func (s *localSandbox) RunCommand(ctx context.Context, req core.RunCommandRequest) (core.CommandResult, error) {
	start := time.Now()
	if req.TimeoutSeconds != nil && *req.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(*req.TimeoutSeconds)*time.Second)
		defer cancel()
	}
	args := []string{"exec", "-i"}
	if req.User != nil && *req.User != "" {
		args = append(args, "-u", *req.User)
	}
	if req.Cwd != nil && *req.Cwd != "" {
		args = append(args, "-w", *req.Cwd)
	}
	args = append(args, s.id, "/bin/sh", "-c", req.Cmd)
	cmd := exec.CommandContext(ctx, "docker", args...)
	if len(req.Env) > 0 {
		cmd.Env = append(append([]string{}, cmd.Environ()...), envSlice(req.Env)...)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	exit := 0
	if runErr != nil {
		if x, ok := runErr.(*exec.ExitError); ok {
			exit = x.ExitCode()
		} else {
			return core.CommandResult{}, mapDockerErr(runErr)
		}
	}
	return core.CommandResult{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exit,
		DurationMs: core.ElapsedMillis(start),
	}, nil
}

func envSlice(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k, v := range m {
		out = append(out, k+"="+v)
	}
	return out
}

func (s *localSandbox) StartCommand(ctx context.Context, req core.StartCommandRequest) (int, string, error) {
	_ = ctx
	n := int(s.pidSeq.Add(1))
	handleID := fmt.Sprintf("h%d-%d", time.Now().UnixNano(), n)
	ch := make(chan asyncOutcome, 1)
	s.handles.Store(handleID, ch)
	go func(r core.StartCommandRequest) {
		res, err := s.RunCommand(context.Background(), core.RunCommandRequest{
			Cmd:  r.Cmd,
			Cwd:  r.Cwd,
			Env:  r.Env,
			User: r.User,
		})
		ch <- asyncOutcome{res: res, err: err}
	}(req)
	return n, handleID, nil
}

func (s *localSandbox) WaitForHandle(ctx context.Context, handleID string) (core.CommandResult, error) {
	v, ok := s.handles.LoadAndDelete(handleID)
	if !ok {
		return core.CommandResult{}, core.ErrNotFound
	}
	ch := v.(chan asyncOutcome)
	select {
	case o := <-ch:
		return o.res, o.err
	case <-ctx.Done():
		return core.CommandResult{}, ctx.Err()
	}
}

func (s *localSandbox) KillProcess(ctx context.Context, pid int) error {
	_, err := s.RunCommand(ctx, core.RunCommandRequest{
		Cmd: fmt.Sprintf(`kill -9 %d 2>/dev/null || true`, pid),
	})
	return err
}

func (s *localSandbox) ListProcesses(ctx context.Context) ([]core.ProcessInfo, error) {
	raw, err := dockerJSON(ctx, "top", s.id, "-eo", "pid,args")
	if err != nil {
		return nil, mapDockerErr(err)
	}
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	if len(lines) < 2 {
		return nil, nil
	}
	out := make([]core.ProcessInfo, 0, len(lines)-1)
	for i := 1; i < len(lines); i++ {
		fields := strings.Fields(lines[i])
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		cmd := strings.Join(fields[1:], " ")
		out = append(out, core.ProcessInfo{PID: pid, Command: cmd})
	}
	return out, nil
}

func (s *localSandbox) ReadFile(ctx context.Context, p string) ([]byte, error) {
	p = core.NormalizePath(p)
	cmd := exec.CommandContext(ctx, "docker", "cp", s.id+":"+p, "-")
	out, err := cmd.Output()
	if err != nil {
		if x, ok := err.(*exec.ExitError); ok && len(x.Stderr) > 0 {
			if strings.Contains(string(x.Stderr), "Could not find the file") {
				return nil, core.ErrNotFound
			}
		}
		return nil, mapDockerErr(err)
	}
	tr := tar.NewReader(bytes.NewReader(out))
	if _, err := tr.Next(); err != nil {
		return nil, err
	}
	return io.ReadAll(tr)
}

func (s *localSandbox) WriteFile(ctx context.Context, p string, content []byte, mode *int, user *string) error {
	p = core.NormalizePath(p)
	_ = mode
	_ = user
	dir := path.Dir(p)
	base := path.Base(p)
	if dir == "." {
		dir = "/"
	}
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	m := int64(0644)
	if mode != nil {
		m = int64(*mode)
	}
	hdr := &tar.Header{Name: base, Mode: m, Size: int64(len(content))}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	if _, err := tw.Write(content); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "docker", "cp", "-", s.id+":"+dir)
	cmd.Stdin = &buf
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%w: docker cp: %v: %s", core.ErrBadConfig, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (s *localSandbox) ListDirectory(ctx context.Context, dirPath string) ([]core.FileInfo, error) {
	dirPath = core.NormalizePath(dirPath)
	res, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: fmt.Sprintf(`ls -1b %q`, dirPath)})
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		return nil, core.ErrNotFound
	}
	names := strings.Split(strings.TrimSpace(res.Stdout), "\n")
	out := make([]core.FileInfo, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		full := path.Join(dirPath, name)
		fi, err := s.statPath(ctx, full, name)
		if err != nil {
			continue
		}
		out = append(out, fi)
	}
	return out, nil
}

func (s *localSandbox) statPath(ctx context.Context, full, name string) (core.FileInfo, error) {
	res, err := s.RunCommand(ctx, core.RunCommandRequest{
		Cmd: fmt.Sprintf(`stat -c '%%s %%f' %q 2>/dev/null`, full),
	})
	if err != nil {
		return core.FileInfo{}, err
	}
	if res.ExitCode != 0 {
		return core.FileInfo{}, core.ErrNotFound
	}
	fields := strings.Fields(strings.TrimSpace(res.Stdout))
	if len(fields) < 2 {
		return core.FileInfo{}, core.ErrNotFound
	}
	size, _ := strconv.ParseInt(fields[0], 10, 64)
	modeHex, _ := strconv.ParseInt(fields[1], 16, 32)
	mode := int(modeHex) & 07777
	isDir := (modeHex & 0040000) != 0
	m := mode
	return core.FileInfo{Name: name, Path: full, IsDir: isDir, Size: size, Mode: &m}, nil
}

func (s *localSandbox) MakeDir(ctx context.Context, p string) error {
	p = core.NormalizePath(p)
	_, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: fmt.Sprintf("mkdir -p %q", p)})
	return err
}

func (s *localSandbox) Remove(ctx context.Context, p string) error {
	p = core.NormalizePath(p)
	_, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: fmt.Sprintf("rm -rf %q", p)})
	return err
}

func (s *localSandbox) Exists(ctx context.Context, p string) (bool, error) {
	p = core.NormalizePath(p)
	res, err := s.RunCommand(ctx, core.RunCommandRequest{Cmd: fmt.Sprintf("test -e %q && echo ok", p)})
	if err != nil {
		return false, err
	}
	return res.ExitCode == 0 && strings.Contains(res.Stdout, "ok"), nil
}

func (s *localSandbox) CreatePTY(context.Context, core.CreatePTYRequest) (core.PTYInfo, error) {
	return core.PTYInfo{}, core.ErrNotSupported
}

func (s *localSandbox) ResizePTY(context.Context, int, int, int) error {
	return core.ErrNotSupported
}

func (s *localSandbox) KillPTY(context.Context, int) error {
	return core.ErrNotSupported
}

func (s *localSandbox) ListPTY(context.Context) ([]core.PTYInfo, error) {
	return nil, core.ErrNotSupported
}

func mapDockerErr(err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "No such container") {
		return core.ErrNotFound
	}
	return providerErr(err)
}
