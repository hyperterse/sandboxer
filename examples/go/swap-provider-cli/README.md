# swap-provider-cli

Selects a provider name from the first command-line argument (or defaults to
``local``), constructs a client, and calls ``list_sandboxes``. Use this to
smoke-test credentials and provider wiring without creating a sandbox.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- Docker for ``local``; hosted providers need their API keys in the environment
  as required by each driver.

## How to run

```bash
cd examples/go
go run ./swap-provider-cli
# optional: go run ./swap-provider-cli e2b
```
