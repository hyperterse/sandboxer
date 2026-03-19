package core

import (
	"errors"
	"fmt"
)

var (
	ErrNotFound      = errors.New("sandboxer: not found")
	ErrUnauthorized  = errors.New("sandboxer: unauthorized")
	ErrRateLimit     = errors.New("sandboxer: rate limited")
	ErrQuotaExceeded = errors.New("sandboxer: quota exceeded")
	ErrNotSupported  = errors.New("sandboxer: not supported")
	ErrBadConfig     = errors.New("sandboxer: bad configuration")
)

// ProviderError wraps a provider-specific failure for HTTP 502 mapping.
type ProviderError struct {
	Provider   ProviderName
	StatusCode *int
	Code       string
	Message    string
}

func (e *ProviderError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("sandboxer: provider %s: %s", e.Provider, e.Message)
}
