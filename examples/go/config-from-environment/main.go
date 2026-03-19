package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	key := os.Getenv("E2B_API_KEY")
	if key == "" {
		fmt.Fprintln(os.Stderr, "Set E2B_API_KEY (matches Python `config-from-environment` sample).")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderE2B, APIKey: key}
	if b := os.Getenv("E2B_API_BASE"); b != "" {
		cfg.BaseURL = b
	}
	if ms := os.Getenv("E2B_DEFAULT_TIMEOUT_MS"); ms != "" {
		if n, err := strconv.Atoi(ms); err == nil && n > 0 {
			cfg.DefaultTimeout = time.Duration(n) * time.Millisecond
		}
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

	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: "echo config from environment"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
