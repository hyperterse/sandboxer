// Package sandboxer is the public API; implementation lives in package core under this module.
package sandboxer

import (
	"context"
	"time"

	c "github.com/hyperterse/sandboxer/sdks/go/core"
)

const Version = c.Version

type (
	Config                  = c.Config
	OAuth2ClientCredentials = c.OAuth2ClientCredentials
	TLSClientConfig         = c.TLSClientConfig
	Provider                = c.Provider
	ProviderName            = c.ProviderName
	Sandbox                 = c.Sandbox
	SandboxInfo             = c.SandboxInfo
	SandboxStatus           = c.SandboxStatus
	FileInfo                = c.FileInfo
	WatchEventType          = c.WatchEventType
	WatchEvent              = c.WatchEvent
	ProcessInfo             = c.ProcessInfo
	CommandResult           = c.CommandResult
	PTYInfo                 = c.PTYInfo
	ListSandboxesFilter     = c.ListSandboxesFilter
	CreateSandboxRequest    = c.CreateSandboxRequest
	RunCommandRequest       = c.RunCommandRequest
	StartCommandRequest     = c.StartCommandRequest
	CreatePTYRequest        = c.CreatePTYRequest
	RetryOptions            = c.RetryOptions
	ProviderError           = c.ProviderError
	Logger                  = c.Logger
	Sandboxer               = c.Sandboxer
)

const (
	ProviderE2B         = c.ProviderE2B
	ProviderDaytona     = c.ProviderDaytona
	ProviderRunloop     = c.ProviderRunloop
	ProviderFlyMachines = c.ProviderFlyMachines
	ProviderLocal       = c.ProviderLocal
	ProviderBlaxel      = c.ProviderBlaxel
)

const (
	SandboxStarting = c.SandboxStarting
	SandboxRunning  = c.SandboxRunning
	SandboxPaused   = c.SandboxPaused
	SandboxStopped  = c.SandboxStopped
	SandboxError    = c.SandboxError
)

const (
	WatchCreate = c.WatchCreate
	WatchModify = c.WatchModify
	WatchDelete = c.WatchDelete
	WatchRename = c.WatchRename
)

var (
	ErrNotFound      = c.ErrNotFound
	ErrUnauthorized  = c.ErrUnauthorized
	ErrRateLimit     = c.ErrRateLimit
	ErrQuotaExceeded = c.ErrQuotaExceeded
	ErrNotSupported  = c.ErrNotSupported
	ErrBadConfig     = c.ErrBadConfig
)

func RegisterProvider(name ProviderName, factory func(Config) (Provider, error)) {
	c.RegisterProvider(name, factory)
}

func New(cfg Config) (*Sandboxer, error) {
	return c.New(cfg)
}

func NewProvider(cfg Config) (Provider, error) {
	return c.NewProvider(cfg)
}

func ParseProviderName(s string) (ProviderName, error) {
	return c.ParseProviderName(s)
}

func ConnectSandbox(ctx context.Context, p Provider, sandboxID string) (Sandbox, error) {
	return c.ConnectSandbox(ctx, p, sandboxID)
}

func ElapsedMillis(start time.Time) int64 {
	return c.ElapsedMillis(start)
}

func RunCommand(ctx context.Context, s Sandbox, req RunCommandRequest) (CommandResult, error) {
	return c.RunCommand(ctx, s, req)
}

func ReadFile(ctx context.Context, s Sandbox, path string) ([]byte, error) {
	return c.ReadFile(ctx, s, path)
}

func WriteFile(ctx context.Context, s Sandbox, path string, content []byte, mode *int, user *string) error {
	return c.WriteFile(ctx, s, path, content, mode, user)
}

func CreatePTY(ctx context.Context, s Sandbox, req CreatePTYRequest) (PTYInfo, error) {
	return c.CreatePTY(ctx, s, req)
}

func DoRetry(ctx context.Context, opts RetryOptions, fn func(context.Context) error) error {
	return c.DoRetry(ctx, opts, fn)
}

func DefaultLogger() Logger {
	return c.DefaultLogger()
}

func Ptr[T any](v T) *T {
	return c.Ptr(v)
}

func Deref[T any](p *T) (v T) {
	return c.Deref(p)
}

func NormalizePath(p string) string {
	return c.NormalizePath(p)
}
