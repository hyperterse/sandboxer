# fly-machines-minimal

Creates a Fly Machine in your app, runs a command over the driver exec path,
then destroys the machine. Requires a Fly API token and app name.

## Prerequisites

- Go toolchain; run from ``examples/go``.
- ``FLY_API_TOKEN`` or ``SANDBOXER_API_KEY``.
- ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.
- Optional ``FLY_API_HOSTNAME`` and ``FLY_REGION`` for API routing.

## How to run

```bash
export FLY_API_TOKEN=your_token_here
export FLY_APP_NAME=your_app_here
cd examples/go
go run ./fly-machines-minimal
```
