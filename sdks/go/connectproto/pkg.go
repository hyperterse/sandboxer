// Package connectproto re-exports helpers from core/connectproto for a shorter import path.
package connectproto

import (
	"context"
	"encoding/json"

	cp "github.com/hyperterse/sandboxer/sdks/go/core/connectproto"
	ch "github.com/hyperterse/sandboxer/sdks/go/core/httpclient"
)

const (
	HeaderProtocolVersion = cp.HeaderProtocolVersion
	HeaderTimeoutMs       = cp.HeaderTimeoutMs
)

func UnaryPost(ctx context.Context, hc *ch.Client, url string, headers map[string]string, reqMsg any, out any) error {
	return cp.UnaryPost(ctx, hc, url, headers, reqMsg, out)
}

func StreamPOST(ctx context.Context, hc *ch.Client, url string, headers map[string]string, reqMsg any, each func(msg json.RawMessage) error) error {
	return cp.StreamPOST(ctx, hc, url, headers, reqMsg, each)
}
