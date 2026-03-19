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

	dir := "/tmp/sandboxer-path"
	if err := sb.MakeDir(ctx, dir); err != nil {
		log.Fatal(err)
	}
	ok, err := sb.Exists(ctx, dir)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("exists:", ok)
	if err := sb.Remove(ctx, dir); err != nil {
		log.Fatal(err)
	}
}
