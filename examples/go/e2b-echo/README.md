# e2b-echo

Creates a sandbox on E2B and runs ``echo``. This is the smallest hosted flow:
you need an E2B API key and network access to the E2B API.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.
- Optional ``E2B_API_BASE`` if you use a non-default API origin.

## How to run

```bash
export E2B_API_KEY=your_key_here
cd examples/go
go run ./e2b-echo
```
