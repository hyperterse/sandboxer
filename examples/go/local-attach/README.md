# local-attach

Creates a sandbox, then calls ``AttachSandbox`` / ``attach_sandbox`` with the
same id to obtain a new handle. Use this when your process restarts but you
still know the sandbox id.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-attach
```
