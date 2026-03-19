# e2b-files

Writes and reads a file in an E2B sandbox over the provider API. Compare with
``local-files`` to see the same file API on a hosted backend.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
cd examples/go
go run ./e2b-files
```
