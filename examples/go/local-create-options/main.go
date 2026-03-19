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

	sb, info, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{
		Provider: sandboxer.ProviderLocal,
		Template: sandboxer.Ptr("alpine:latest"),
		Metadata: map[string]string{"example": "local-create-options"},
		Envs:     map[string]string{"DEMO": "1"},
	})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	fmt.Println("metadata:", info.Metadata)
	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{Cmd: `sh -c 'echo $DEMO'`})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
