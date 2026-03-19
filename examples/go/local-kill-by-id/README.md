# local-kill-by-id

Creates a sandbox, then destroys it with ``KillSandbox`` / ``kill_sandbox`` on
the client using the provider id without calling ``Kill`` on the handle first.
Shows teardown when you only store the id string.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-kill-by-id
```
