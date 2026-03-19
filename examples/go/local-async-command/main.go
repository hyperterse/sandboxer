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

	_, handleID, err := sb.StartCommand(ctx, sandboxer.StartCommandRequest{Cmd: "echo async"})
	if err != nil {
		log.Fatal(err)
	}
	res, err := sb.WaitForHandle(ctx, handleID)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
