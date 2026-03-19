# config-from-environment

Creates an E2B sandbox using configuration read from the environment:
``E2B_API_KEY``, optional ``E2B_API_BASE``, and optional
``E2B_DEFAULT_TIMEOUT_MS`` for the HTTP client default timeout. Matches the
spirit of the Python sample in this repository.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``E2B_API_KEY`` set.
- Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.

## How to run

```bash
export E2B_API_KEY=your_key_here
cd examples/go
go run ./config-from-environment
```
