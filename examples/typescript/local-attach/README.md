# local-attach

Creates a sandbox, then calls ``AttachSandbox`` / ``attach_sandbox`` with the
same id to obtain a new handle. Use this when your process restarts but you
still know the sandbox id.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-attach/index.ts
```
