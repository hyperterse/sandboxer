# handle-unsupported

Calls ``CreatePTY`` / ``create_pty`` on a local sandbox. The local Docker driver
returns ``ErrNotSupported`` / ``NotSupportedError`` for PTY, so the sample shows
how to branch on that error instead of crashing.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/handle-unsupported/index.ts
```
