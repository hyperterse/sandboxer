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

	sb0, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer sb0.Kill(ctx)

	id := sb0.ID()
	sb, err := p.AttachSandbox(ctx, id)
	if err != nil {
		log.Fatal(err)
	}
	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: "echo attached"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
