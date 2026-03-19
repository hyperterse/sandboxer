package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	ctx := context.Background()
	name := sandboxer.ProviderLocal
	if len(os.Args) > 1 {
		var err error
		name, err = sandboxer.ParseProviderName(os.Args[1])
		if err != nil {
			log.Fatal(err)
		}
	}
	p, err := sandboxer.NewProvider(sandboxer.Config{Provider: name})
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()
	list, err := p.ListSandboxes(ctx, sandboxer.ListSandboxesFilter{})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("provider=%s listed %d sandboxes\n", name, len(list))
}
