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
	if os.Getenv("E2B_API_KEY") == "" {
		fmt.Fprintln(os.Stderr, "Set E2B_API_KEY (or SANDBOXER_API_KEY) to run this example.")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderE2B, APIKey: os.Getenv("E2B_API_KEY")}
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

	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: "echo hello from e2b"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
