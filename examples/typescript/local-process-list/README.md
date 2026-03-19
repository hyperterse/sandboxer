# local-process-list

Calls ``ListProcesses`` / ``list_processes`` to inspect processes visible inside
the container. Useful for debugging what is still running after you start
background work.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-process-list/index.ts
```
