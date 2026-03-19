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

	path := "/tmp/sandboxer-demo.txt"
	if err := sb.WriteFile(ctx, path, []byte("hello files\n"), sandboxer.Ptr(0644), nil); err != nil {
		log.Fatal(err)
	}
	data, err := sb.ReadFile(ctx, path)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(string(data))
}
