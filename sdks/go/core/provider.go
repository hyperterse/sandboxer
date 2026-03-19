package core

import "context"

// Provider is the top-level sandbox backend.
type Provider interface {
	ListSandboxes(ctx context.Context, filter ListSandboxesFilter) ([]SandboxInfo, error)
	KillSandbox(ctx context.Context, sandboxID string) error
	CreateSandbox(ctx context.Context, req CreateSandboxRequest) (Sandbox, SandboxInfo, error)
	// AttachSandbox returns a live handle for an existing sandbox by id (reconnect).
	AttachSandbox(ctx context.Context, sandboxID string) (Sandbox, error)
	Close() error
}
