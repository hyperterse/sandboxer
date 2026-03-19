package main

import (
	"context"
	"fmt"
	"log"
	"strings"

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

	_, handle, err := sb.StartCommand(ctx, sandboxer.StartCommandRequest{Cmd: "sleep 60"})
	if err != nil {
		log.Fatal(err)
	}
	procs, err := sb.ListProcesses(ctx)
	if err != nil {
		log.Fatal(err)
	}
	var target int
	for _, pr := range procs {
		if strings.Contains(pr.Command, "sleep 60") {
			target = pr.PID
			break
		}
	}
	if target == 0 {
		log.Fatal("could not find sleep process")
	}
	if err := sb.KillProcess(ctx, target); err != nil {
		log.Fatal(err)
	}
	res, err := sb.WaitForHandle(ctx, handle)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("killed pid", target, "exit", res.ExitCode)
}
