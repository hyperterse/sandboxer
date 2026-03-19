package core

import "time"

// TLSClientConfig configures mutual TLS and custom roots for outbound HTTPS to providers.
type TLSClientConfig struct {
	CertFile, KeyFile  string
	CAFile             string
	InsecureSkipVerify bool
}

// OAuth2ClientCredentials configures OAuth2 client-credentials token source for outbound API calls.
type OAuth2ClientCredentials struct {
	TokenURL     string
	ClientID     string
	ClientSecret string
	Scopes       []string
}

// Config configures a Provider instance.
type Config struct {
	Provider ProviderName
	// APIKey is the primary secret (E2B: X-API-Key; others often map to Bearer — see each provider).
	APIKey         string
	BaseURL        string
	DefaultTimeout time.Duration

	TLS    TLSClientConfig
	OAuth2 OAuth2ClientCredentials
}
