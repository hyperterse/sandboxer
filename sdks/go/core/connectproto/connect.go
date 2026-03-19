package connectproto

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/hyperterse/sandboxer/sdks/go/core/httpclient"
)

const (
	HeaderProtocolVersion = "Connect-Protocol-Version"
	HeaderTimeoutMs       = "Connect-Timeout-Ms"
)

func mustJSON(v any) io.Reader {
	b, err := json.Marshal(v)
	if err != nil {
		return bytes.NewReader([]byte("{}"))
	}
	return bytes.NewReader(b)
}

// UnaryPost posts JSON and decodes Connect unary JSON response into out.
func UnaryPost(ctx context.Context, hc *httpclient.Client, url string, headers map[string]string, reqMsg any, out any) error {
	h := cloneHeaders(headers)
	h[HeaderProtocolVersion] = "1"
	status, raw, err := hc.DoRaw(ctx, http.MethodPost, url, h, mustJSON(reqMsg), "application/json")
	if err != nil {
		if he, ok := err.(httpclient.HTTPError); ok {
			return decodeConnectErr(he)
		}
		return err
	}
	_ = status
	if len(raw) == 0 {
		return nil
	}
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(raw, &probe); err != nil {
		return json.Unmarshal(raw, out)
	}
	if errObj, ok := probe["error"]; ok && len(errObj) > 0 {
		var env struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(errObj, &env)
		if env.Message != "" {
			return fmt.Errorf("connect error: %s", env.Message)
		}
		return fmt.Errorf("connect error: %s", string(errObj))
	}
	if res, ok := probe["result"]; ok {
		return json.Unmarshal(res, out)
	}
	return json.Unmarshal(raw, out)
}

// StreamPOST posts a JSON body and reads a Connect application/connect+json server stream.
func StreamPOST(ctx context.Context, hc *httpclient.Client, url string, headers map[string]string, reqMsg any, each func(msg json.RawMessage) error) error {
	h := cloneHeaders(headers)
	h[HeaderProtocolVersion] = "1"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, mustJSON(reqMsg))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/connect+json")
	for k, v := range h {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := hc.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return decodeConnectErr(httpclient.HTTPError{Status: resp.StatusCode, Body: raw})
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && ct != "application/connect+json" && ct != "application/json" {
		// Some proxies return json stream without exact header
	}
	return readConnectStream(resp.Body, each)
}

func readConnectStream(r io.Reader, each func(json.RawMessage) error) error {
	for {
		var hdr [5]byte
		if _, err := io.ReadFull(r, hdr[:]); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		n := int(binary.BigEndian.Uint32(hdr[1:5]))
		if n <= 0 || n > 64<<20 {
			return fmt.Errorf("connect stream: invalid frame size %d", n)
		}
		buf := make([]byte, n)
		if _, err := io.ReadFull(r, buf); err != nil {
			return err
		}
		var top struct {
			Error json.RawMessage `json:"error"`
		}
		if err := json.Unmarshal(buf, &top); err != nil {
			return err
		}
		if len(top.Error) > 0 {
			var env struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			}
			_ = json.Unmarshal(top.Error, &env)
			if env.Message != "" {
				return fmt.Errorf("connect stream error: %s", env.Message)
			}
			return fmt.Errorf("connect stream error: %s", string(top.Error))
		}
		if err := each(json.RawMessage(buf)); err != nil {
			return err
		}
	}
}

func decodeConnectErr(he httpclient.HTTPError) error {
	var env struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(he.Body, &env)
	if env.Message != "" {
		return fmt.Errorf("http %d: %s", he.Status, env.Message)
	}
	return fmt.Errorf("http %d: %s", he.Status, string(he.Body))
}

func cloneHeaders(h map[string]string) map[string]string {
	out := make(map[string]string, len(h)+2)
	for k, v := range h {
		out[k] = v
	}
	return out
}
