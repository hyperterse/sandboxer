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

	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{
		Provider: sandboxer.ProviderLocal,
		Metadata: map[string]string{"filter-demo": "needle-example-unique"},
	})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	prov := sandboxer.ProviderLocal
	list, err := p.ListSandboxes(ctx, sandboxer.ListSandboxesFilter{
		Provider:       &prov,
		MetadataFilter: "needle-example",
		Limit:          50,
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("matched %d sandboxes (includes id=%s)\n", len(list), sb.ID())
}
