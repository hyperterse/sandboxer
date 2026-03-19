# context-timeout

Runs a command that would take longer than the allowed timeout (Go uses a short
context deadline; Python and TypeScript use ``timeout_seconds`` /
``timeoutSeconds`` on the command). Shows how timeouts surface as errors.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/context-timeout/index.ts
```
