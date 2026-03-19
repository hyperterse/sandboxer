# local-files

Writes a small file inside the sandbox with ``WriteFile`` / ``write_file``, then
reads it back with ``ReadFile`` / ``read_file``. Shows how binary-safe payloads
move through the SDK on the local Docker backend.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.
- Same SDK import path as other TypeScript examples.

## How to run

```bash
npx tsx examples/typescript/local-files/index.ts
```
