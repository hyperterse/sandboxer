package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	if os.Getenv("BLAXEL_API_KEY") == "" && os.Getenv("SANDBOXER_API_KEY") == "" {
		fmt.Fprintln(os.Stderr, "Set BLAXEL_API_KEY (or SANDBOXER_API_KEY / BL_API_KEY).")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderBlaxel, APIKey: firstNonEmpty(os.Getenv("BLAXEL_API_KEY"), os.Getenv("SANDBOXER_API_KEY"))}
	if b := os.Getenv("BLAXEL_API_BASE"); b != "" {
		cfg.BaseURL = b
	}
	p, err := sandboxer.NewProvider(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	sb, info, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderBlaxel})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("created sandbox:", info.ID, "status:", info.Status)
	if err := sb.Kill(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("deleted sandbox:", info.ID)
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
