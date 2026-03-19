# context-timeout

Runs a command that would take longer than the allowed timeout (Go uses a short
context deadline; Python and TypeScript use ``timeout_seconds`` /
``timeoutSeconds`` on the command). Shows how timeouts surface as errors.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./context-timeout
```
