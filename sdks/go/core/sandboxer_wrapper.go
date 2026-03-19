package core

import "context"

// Sandboxer is a convenience wrapper around a Provider.
// It is the primary entry point for Go users.
type Sandboxer struct {
	provider Provider
	cfg      Config
}

// New creates a Sandboxer for the given config.
func New(cfg Config) (*Sandboxer, error) {
	p, err := NewProvider(cfg)
	if err != nil {
		return nil, err
	}
	return &Sandboxer{provider: p, cfg: cfg}, nil
}

func (s *Sandboxer) CreateSandbox(ctx context.Context, req CreateSandboxRequest) (Sandbox, SandboxInfo, error) {
	return s.provider.CreateSandbox(ctx, req)
}

func (s *Sandboxer) ListSandboxes(ctx context.Context, filter ListSandboxesFilter) ([]SandboxInfo, error) {
	return s.provider.ListSandboxes(ctx, filter)
}

func (s *Sandboxer) KillSandbox(ctx context.Context, sandboxID string) error {
	return s.provider.KillSandbox(ctx, sandboxID)
}

func (s *Sandboxer) AttachSandbox(ctx context.Context, sandboxID string) (Sandbox, error) {
	return s.provider.AttachSandbox(ctx, sandboxID)
}

func (s *Sandboxer) Close() error {
	return s.provider.Close()
}

// Provider returns the underlying Provider.
func (s *Sandboxer) Provider() Provider {
	return s.provider
}
