# local-port-url

Calls ``PortURL`` / ``portUrl`` to resolve a preview or tunnel URL for a port
inside the sandbox. The default local container does not publish host ports, so
you often see ``ErrNotSupported`` or ``NotSupportedError`` until you map ports
in your workflow.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-port-url
```
