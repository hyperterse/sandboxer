# daytona-minimal

Creates a Daytona sandbox and runs a short shell command. You need Daytona
credentials and a base URL that match your workspace.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or ``SANDBOXER_API_KEY``.
- Optional ``DAYTONA_API_BASE`` or ``DAYTONA_TOOLBOX_BASE_URL`` per your driver.

## How to run

```bash
export DAYTONA_API_KEY=your_token_here
cd examples/go
go run ./daytona-minimal
```
