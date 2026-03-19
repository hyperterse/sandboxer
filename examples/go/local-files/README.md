# local-files

Writes a small file inside the sandbox with ``WriteFile`` / ``write_file``, then
reads it back with ``ReadFile`` / ``read_file``. Shows how binary-safe payloads
move through the SDK on the local Docker backend.

## Prerequisites

- Go toolchain matching ``sdks/go/go.mod``.
- Docker installed and the daemon running.
- Run from the ``examples/go`` module as described for ``local-echo``.

## How to run

```bash
cd examples/go
go run ./local-files
```
