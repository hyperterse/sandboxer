# local-list-sandboxes

Creates a sandbox, then calls ``ListSandboxes`` / ``list_sandboxes`` to list
sandbox records the provider sees. On ``local``, containers are filtered by
Sandboxer labels.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-list-sandboxes/index.ts
```
