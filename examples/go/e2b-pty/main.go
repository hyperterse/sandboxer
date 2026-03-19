package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	key := firstNonEmpty(os.Getenv("E2B_API_KEY"), os.Getenv("SANDBOXER_API_KEY"))
	if key == "" {
		fmt.Fprintln(os.Stderr, "Set E2B_API_KEY (or SANDBOXER_API_KEY).")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderE2B, APIKey: key}
	if b := os.Getenv("E2B_API_BASE"); b != "" {
		cfg.BaseURL = b
	}
	p, err := sandboxer.NewProvider(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderE2B})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	_, err = sb.CreatePTY(ctx, sandboxer.CreatePTYRequest{Rows: sandboxer.Ptr(24), Cols: sandboxer.Ptr(80)})
	if err != nil {
		if errors.Is(err, sandboxer.ErrNotSupported) {
			fmt.Println("CreatePTY not supported by this E2B driver build; see provider implementation.")
			return
		}
		log.Fatal(err)
	}
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
