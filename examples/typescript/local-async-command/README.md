# local-async-command

Starts a command asynchronously with ``StartCommand`` / ``start_command``, then
waits for completion with ``WaitForHandle`` / ``wait_for_handle``. Use this
pattern for long-running tasks without blocking the initial API call.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-async-command/index.ts
```
