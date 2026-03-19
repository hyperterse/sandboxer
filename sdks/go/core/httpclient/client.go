package httpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go/core"
)

// Client is a thin JSON HTTP helper over a shared transport.
type Client struct {
	HTTP    *http.Client
	Timeout time.Duration
}

// New returns an HTTP client using cfg TLS/OAuth2 settings.
func New(cfg core.Config) (*Client, error) {
	rt, err := Transport(cfg)
	if err != nil {
		return nil, err
	}
	timeout := cfg.DefaultTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Client{
		HTTP: &http.Client{
			Transport: rt,
			Timeout:   timeout,
		},
		Timeout: timeout,
	}, nil
}

// Do issues a request with optional JSON body and decodes JSON responses into out (if out != nil and body is JSON).
func (c *Client) Do(ctx context.Context, method, url string, headers map[string]string, body any, out any) (status int, err error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rdr)
	if err != nil {
		return 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return resp.StatusCode, HTTPError{Status: resp.StatusCode, Body: raw}
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode json: %w", err)
		}
	}
	return resp.StatusCode, nil
}

// DoRaw is like Do but sends raw body and returns response bytes.
func (c *Client) DoRaw(ctx context.Context, method, url string, headers map[string]string, body io.Reader, contentType string) (status int, respBody []byte, err error) {
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return 0, nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, v := range headers {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return resp.StatusCode, raw, HTTPError{Status: resp.StatusCode, Body: raw}
	}
	return resp.StatusCode, raw, nil
}

// HTTPError carries a non-2xx response body for provider error mapping.
type HTTPError struct {
	Status int
	Body   []byte
}

func (e HTTPError) Error() string {
	return fmt.Sprintf("http status %d", e.Status)
}
