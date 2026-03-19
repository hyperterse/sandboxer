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

	sb, info, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	fmt.Println("from create:", info.ID, info.Status)
	fresh, err := sb.Info(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("from Info:", fresh.ID, fresh.Status)
}
