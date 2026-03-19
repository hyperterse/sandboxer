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
	tok := os.Getenv("FLY_API_TOKEN")
	if tok == "" {
		tok = os.Getenv("SANDBOXER_API_KEY")
	}
	app := os.Getenv("FLY_APP_NAME")
	if app == "" {
		app = os.Getenv("SANDBOXER_FLY_APP")
	}
	if tok == "" {
		fmt.Fprintln(os.Stderr, "Set FLY_API_TOKEN (or SANDBOXER_API_KEY).")
		os.Exit(1)
	}
	if app == "" {
		fmt.Fprintln(os.Stderr, "Set FLY_APP_NAME or SANDBOXER_FLY_APP.")
		os.Exit(1)
	}
	ctx := context.Background()
	cfg := sandboxer.Config{Provider: sandboxer.ProviderFlyMachines, APIKey: tok}
	if h := os.Getenv("FLY_API_HOSTNAME"); h != "" {
		cfg.BaseURL = h
	}
	p, err := sandboxer.NewProvider(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderFlyMachines})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: "echo hello from fly"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
