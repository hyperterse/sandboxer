# local-echo

Creates a sandbox with the ``local`` provider (Docker on your machine), runs one
``echo`` command, then deletes the sandbox. This is the smallest end-to-end
path: no cloud API key, only the Docker CLI talking to your container engine.
Use it to confirm Sandboxer can provision and tear down workloads.

## Prerequisites

- Go toolchain matching ``sdks/go/go.mod``.
- Docker installed and the daemon running; ``docker info`` must succeed.
- Commands below assume the ``examples/go`` module (``go.mod`` uses a
  ``replace`` to the SDK in this repo).

## How to run

```bash
cd examples/go
go run ./local-echo
```
