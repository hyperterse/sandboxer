# runloop-minimal

Creates a Runloop sandbox and runs ``echo``. Validates your Runloop API key and
base URL configuration.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``RUNLOOP_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``RUNLOOP_API_BASE``.

## How to run

```bash
export RUNLOOP_API_KEY=your_key_here
cd examples/go
go run ./runloop-minimal
```
