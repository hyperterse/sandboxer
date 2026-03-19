# local-list-sandboxes

Creates a sandbox, then calls ``ListSandboxes`` / ``list_sandboxes`` to list
sandbox records the provider sees. On ``local``, containers are filtered by
Sandboxer labels.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-list-sandboxes
```
