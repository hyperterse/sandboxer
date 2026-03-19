package main

import (
	"context"
	"fmt"
	"log"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	ctx := context.Background()
	p, err := sandboxer.NewProvider(sandboxer.Config{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	_, h1, err := sb.StartCommand(ctx, sandboxer.StartCommandRequest{Cmd: "echo step1"})
	if err != nil {
		log.Fatal(err)
	}
	r1, err := sb.WaitForHandle(ctx, h1)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(r1.Stdout)

	_, h2, err := sb.StartCommand(ctx, sandboxer.StartCommandRequest{Cmd: "echo step2"})
	if err != nil {
		log.Fatal(err)
	}
	r2, err := sb.WaitForHandle(ctx, h2)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(r2.Stdout)
}
