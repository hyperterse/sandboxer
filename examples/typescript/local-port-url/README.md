# local-port-url

Calls ``PortURL`` / ``portUrl`` to resolve a preview or tunnel URL for a port
inside the sandbox. The default local container does not publish host ports, so
you often see ``ErrNotSupported`` or ``NotSupportedError`` until you map ports
in your workflow.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-port-url/index.ts
```
