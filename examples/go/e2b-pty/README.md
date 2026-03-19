# e2b-pty

Attempts to open a PTY session on E2B. Depending on the driver version, this may
still return ``ErrNotSupported`` / ``NotSupportedError``; the sample prints a
clear message when PTY is not wired for that backend.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
cd examples/go
go run ./e2b-pty
```
