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

	res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{
		Cmd: "sh -c 'echo $DEMO_VAR'",
		Env: map[string]string{"DEMO_VAR": "from-env"},
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Print(res.Stdout)
}
