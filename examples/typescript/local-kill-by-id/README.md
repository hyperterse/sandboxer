# local-kill-by-id

Creates a sandbox, then destroys it with ``KillSandbox`` / ``kill_sandbox`` on
the client using the provider id without calling ``Kill`` on the handle first.
Shows teardown when you only store the id string.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-kill-by-id/index.ts
```
