package core

import "context"

// ReadFile reads a file from the sandbox filesystem.
func ReadFile(ctx context.Context, s Sandbox, path string) ([]byte, error) {
	if s == nil {
		return nil, ErrBadConfig
	}
	return s.ReadFile(ctx, NormalizePath(path))
}

// WriteFile writes bytes to a path in the sandbox.
func WriteFile(ctx context.Context, s Sandbox, path string, content []byte, mode *int, user *string) error {
	if s == nil {
		return ErrBadConfig
	}
	return s.WriteFile(ctx, NormalizePath(path), content, mode, user)
}
