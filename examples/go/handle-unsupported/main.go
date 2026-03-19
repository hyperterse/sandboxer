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

	_, err = sb.CreatePTY(ctx, sandboxer.CreatePTYRequest{})
	if err != nil {
		if errors.Is(err, sandboxer.ErrNotSupported) {
			fmt.Println("PTY is not supported on the local driver (expected).")
			return
		}
		log.Fatal(err)
	}
}
