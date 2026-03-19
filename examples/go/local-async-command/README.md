# local-async-command

Starts a command asynchronously with ``StartCommand`` / ``start_command``, then
waits for completion with ``WaitForHandle`` / ``wait_for_handle``. Use this
pattern for long-running tasks without blocking the initial API call.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-async-command
```
