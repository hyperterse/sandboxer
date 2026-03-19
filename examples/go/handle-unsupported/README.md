# handle-unsupported

Calls ``CreatePTY`` / ``create_pty`` on a local sandbox. The local Docker driver
returns ``ErrNotSupported`` / ``NotSupportedError`` for PTY, so the sample shows
how to branch on that error instead of crashing.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./handle-unsupported
```
