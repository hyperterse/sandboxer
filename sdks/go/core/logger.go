package core

import "log/slog"

// Logger is the interface used by optional internals; default is slog.Default().
type Logger interface {
	Debug(msg string, args ...any)
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
	Error(msg string, args ...any)
}

type slogLogger struct{}

func (slogLogger) Debug(msg string, args ...any) { slog.Debug(msg, args...) }
func (slogLogger) Info(msg string, args ...any)  { slog.Info(msg, args...) }
func (slogLogger) Warn(msg string, args ...any)  { slog.Warn(msg, args...) }
func (slogLogger) Error(msg string, args ...any) { slog.Error(msg, args...) }

// DefaultLogger returns the slog-backed logger.
func DefaultLogger() Logger {
	return slogLogger{}
}
