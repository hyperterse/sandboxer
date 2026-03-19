package core

import "strings"

// Ptr returns a pointer to v.
func Ptr[T any](v T) *T {
	return &v
}

// Deref returns *p when non-nil, else zero.
func Deref[T any](p *T) (v T) {
	if p != nil {
		return *p
	}
	return v
}

// NormalizePath trims spaces; does not validate beyond that.
func NormalizePath(p string) string {
	return strings.TrimSpace(p)
}
