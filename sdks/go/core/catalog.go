// Provider names, shared structs, registration, and filters.
package core

import (
	"fmt"
	"sync"
	"time"
)

// ProviderName identifies a backend implementation.
type ProviderName string

const (
	ProviderE2B         ProviderName = "e2b"
	ProviderDaytona     ProviderName = "daytona"
	ProviderRunloop     ProviderName = "runloop"
	ProviderFlyMachines ProviderName = "fly-machines"
	ProviderLocal       ProviderName = "local"
	ProviderBlaxel      ProviderName = "blaxel"
)

// SandboxStatus is the lifecycle state of a sandbox.
type SandboxStatus string

const (
	SandboxStarting SandboxStatus = "starting"
	SandboxRunning  SandboxStatus = "running"
	SandboxPaused   SandboxStatus = "paused"
	SandboxStopped  SandboxStatus = "stopped"
	SandboxError    SandboxStatus = "error"
)

// SandboxInfo is portable metadata returned by providers and the HTTP API.
type SandboxInfo struct {
	ID        string            `json:"id"`
	Provider  ProviderName      `json:"provider"`
	Template  *string           `json:"template,omitempty"`
	Status    SandboxStatus     `json:"status"`
	StartedAt time.Time         `json:"startedAt"`
	ExpiresAt *time.Time        `json:"expiresAt,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	CPUs      *int              `json:"cpus,omitempty"`
	MemoryMb  *int              `json:"memoryMb,omitempty"`
}

// FileInfo describes a filesystem entry inside a sandbox.
type FileInfo struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
	Mode  *int   `json:"mode,omitempty"`
}

// WatchEventType is used for future watch/stream APIs.
type WatchEventType string

const (
	WatchCreate WatchEventType = "create"
	WatchModify WatchEventType = "modify"
	WatchDelete WatchEventType = "delete"
	WatchRename WatchEventType = "rename"
)

// WatchEvent describes a filesystem watch event (v2 streaming).
type WatchEvent struct {
	Path      string         `json:"path"`
	EventType WatchEventType `json:"eventType"`
}

// ProcessInfo describes a running process inside a sandbox.
type ProcessInfo struct {
	PID     int     `json:"pid"`
	Command string  `json:"command"`
	User    *string `json:"user,omitempty"`
}

// CommandResult is the outcome of a synchronous or waited async command.
type CommandResult struct {
	Stdout     string  `json:"stdout"`
	Stderr     string  `json:"stderr"`
	ExitCode   int     `json:"exitCode"`
	DurationMs int64   `json:"durationMs"`
	Error      *string `json:"error,omitempty"`
}

// PTYInfo describes an allocated pseudo-terminal session.
type PTYInfo struct {
	PID  int `json:"pid"`
	Rows int `json:"rows"`
	Cols int `json:"cols"`
}

var (
	mu        sync.RWMutex
	factories = map[ProviderName]func(Config) (Provider, error){}
)

// RegisterProvider registers a provider constructor. Typically called from init().
func RegisterProvider(name ProviderName, factory func(Config) (Provider, error)) {
	mu.Lock()
	defer mu.Unlock()
	factories[name] = factory
}

// NewProvider constructs the Provider for cfg.Provider.
func NewProvider(cfg Config) (Provider, error) {
	mu.RLock()
	f, ok := factories[cfg.Provider]
	mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: unknown provider %q", ErrBadConfig, cfg.Provider)
	}
	return f(cfg)
}

// ParseProviderName normalizes a string to ProviderName.
func ParseProviderName(s string) (ProviderName, error) {
	p := ProviderName(s)
	switch p {
	case ProviderE2B, ProviderDaytona, ProviderRunloop, ProviderFlyMachines, ProviderLocal, ProviderBlaxel:
		return p, nil
	default:
		return "", fmt.Errorf("%w: invalid provider %q", ErrBadConfig, s)
	}
}

// ListSandboxesFilter filters provider.ListSandboxes.
type ListSandboxesFilter struct {
	Provider       *ProviderName
	MetadataFilter string
	Limit          int
}
