package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/hyperterse/sandboxer/sdks/go"
	_ "github.com/hyperterse/sandboxer/sdks/go/providers"
)

func main() {
	p, err := sandboxer.NewProvider(sandboxer.Config{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	ctx := context.Background()
	sb, _, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{Provider: sandboxer.ProviderLocal})
	if err != nil {
		log.Fatal(err)
	}
	defer sb.Kill(ctx)

	runCtx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()

	_, err = sb.RunCommand(runCtx, sandboxer.RunCommandRequest{Cmd: "sleep 10"})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			fmt.Println("command timed out due to context deadline (expected)")
			return
		}
		log.Fatal(err)
	}
}
