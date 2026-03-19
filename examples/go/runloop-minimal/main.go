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
	if os.Getenv("RUNLOOP_API_KEY") == "" && os.Getenv("SANDBOXER_API_KEY") == "" {
		fmt.Fprintln(os.Stderr, "Set RUNLOOP_API_KEY (or SANDBOXER_API_KEY) to run this example.")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderRunloop, APIKey: firstNonEmpty(os.Getenv("RUNLOOP_API_KEY"), os.Getenv("SANDBOXER_API_KEY"))}
	if b := os.Getenv("RUNLOOP_API_BASE"); b != "" {
		cfg.BaseURL = b
	}
	p, err := sandboxer.NewProvider(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderRunloop})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: "echo hello from runloop"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
