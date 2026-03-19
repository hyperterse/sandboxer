# local-process-kill

Starts a long-running command, finds a process in the listing, and sends
``KillProcess`` / ``kill_process`` to stop it. Demonstrates process control when
you cannot rely on the shell alone.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-process-kill
```
