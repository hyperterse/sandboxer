package core

import (
	"context"
	"time"
)

// CreateSandboxRequest is the create-sandbox input shared across SDKs.
type CreateSandboxRequest struct {
	Provider       ProviderName
	Template       *string
	TimeoutSeconds *int
	Metadata       map[string]string
	Envs           map[string]string
	CPUs           *int
	MemoryMb       *int
	AutoDestroy    *bool
}

// Sandbox is a handle to a running sandbox instance.
type Sandbox interface {
	ID() string

	Info(ctx context.Context) (SandboxInfo, error)
	IsRunning(ctx context.Context) (bool, error)
	Pause(ctx context.Context) error
	Resume(ctx context.Context) error
	Kill(ctx context.Context) error
	PortURL(ctx context.Context, port int) (string, error)

	RunCommand(ctx context.Context, req RunCommandRequest) (CommandResult, error)
	StartCommand(ctx context.Context, req StartCommandRequest) (pid int, handleID string, err error)
	WaitForHandle(ctx context.Context, handleID string) (CommandResult, error)
	KillProcess(ctx context.Context, pid int) error
	ListProcesses(ctx context.Context) ([]ProcessInfo, error)

	ReadFile(ctx context.Context, path string) ([]byte, error)
	WriteFile(ctx context.Context, path string, content []byte, mode *int, user *string) error
	ListDirectory(ctx context.Context, path string) ([]FileInfo, error)
	MakeDir(ctx context.Context, path string) error
	Remove(ctx context.Context, path string) error
	Exists(ctx context.Context, path string) (bool, error)

	CreatePTY(ctx context.Context, req CreatePTYRequest) (PTYInfo, error)
	ResizePTY(ctx context.Context, pid int, rows, cols int) error
	KillPTY(ctx context.Context, pid int) error
	ListPTY(ctx context.Context) ([]PTYInfo, error)
}

// ConnectSandbox re-attaches to an existing sandbox (Go package helper; use Provider.AttachSandbox from other languages).
func ConnectSandbox(ctx context.Context, p Provider, sandboxID string) (Sandbox, error) {
	if p == nil {
		return nil, ErrBadConfig
	}
	return p.AttachSandbox(ctx, sandboxID)
}

// ElapsedMillis returns milliseconds since start for CommandResult.DurationMs helpers.
func ElapsedMillis(start time.Time) int64 {
	return time.Since(start).Milliseconds()
}
