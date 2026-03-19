package core

import (
	"context"
	"time"
)

// RetryOptions controls simple linear backoff retries.
type RetryOptions struct {
	MaxAttempts int
	Interval    time.Duration
}

// DoRetry runs fn until success or attempts exhausted. Returns last error.
func DoRetry(ctx context.Context, opts RetryOptions, fn func(context.Context) error) error {
	if opts.MaxAttempts < 1 {
		opts.MaxAttempts = 1
	}
	if opts.Interval <= 0 {
		opts.Interval = 200 * time.Millisecond
	}
	var last error
	for i := 0; i < opts.MaxAttempts; i++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		last = fn(ctx)
		if last == nil {
			return nil
		}
		if i < opts.MaxAttempts-1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(opts.Interval):
			}
		}
	}
	return last
}
