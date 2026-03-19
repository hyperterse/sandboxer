package httpclient

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"

	"github.com/hyperterse/sandboxer/sdks/go/core"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/clientcredentials"
)

// Transport builds an http.RoundTripper with optional client cert, custom CA, and OAuth2 client-credentials.
func Transport(cfg core.Config) (http.RoundTripper, error) {
	t := http.DefaultTransport.(*http.Transport).Clone()
	if cfg.TLS.InsecureSkipVerify || cfg.TLS.CAFile != "" || cfg.TLS.CertFile != "" {
		t.TLSClientConfig = &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: cfg.TLS.InsecureSkipVerify,
		}
		if cfg.TLS.CAFile != "" {
			b, err := os.ReadFile(cfg.TLS.CAFile)
			if err != nil {
				return nil, fmt.Errorf("read CA bundle: %w", err)
			}
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM(b) {
				return nil, fmt.Errorf("parse CA bundle %s", cfg.TLS.CAFile)
			}
			t.TLSClientConfig.RootCAs = pool
		}
		if cfg.TLS.CertFile != "" && cfg.TLS.KeyFile != "" {
			cert, err := tls.LoadX509KeyPair(cfg.TLS.CertFile, cfg.TLS.KeyFile)
			if err != nil {
				return nil, fmt.Errorf("load client cert: %w", err)
			}
			t.TLSClientConfig.Certificates = []tls.Certificate{cert}
		}
	}

	base := http.RoundTripper(t)
	if cfg.OAuth2.TokenURL != "" && cfg.OAuth2.ClientID != "" && cfg.OAuth2.ClientSecret != "" {
		cc := clientcredentials.Config{
			ClientID:       cfg.OAuth2.ClientID,
			ClientSecret:   cfg.OAuth2.ClientSecret,
			TokenURL:       cfg.OAuth2.TokenURL,
			Scopes:         cfg.OAuth2.Scopes,
			EndpointParams: nil,
		}
		return &oauth2.Transport{
			Source: cc.TokenSource(context.Background()),
			Base:   base,
		}, nil
	}
	return base, nil
}
