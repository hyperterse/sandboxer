# local-process-kill

Starts a long-running command, finds a process in the listing, and sends
``KillProcess`` / ``kill_process`` to stop it. Demonstrates process control when
you cannot rely on the shell alone.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-process-kill/index.ts
```
