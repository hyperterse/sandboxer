package main

import (
	"context"
	"errors"
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

	_, err = sb.PortURL(ctx, 8080)
	if err != nil {
		if errors.Is(err, sandboxer.ErrNotSupported) {
			fmt.Println("no host port mapping for 8080 (expected for default local container without -p)")
			return
		}
		log.Fatal(err)
	}
}
