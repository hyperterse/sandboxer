# local-process-list

Calls ``ListProcesses`` / ``list_processes`` to inspect processes visible inside
the container. Useful for debugging what is still running after you start
background work.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-process-list
```
