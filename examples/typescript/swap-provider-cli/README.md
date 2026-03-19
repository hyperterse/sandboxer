# swap-provider-cli

Selects a provider name from the first command-line argument (or defaults to
``local``), constructs a client, and calls ``list_sandboxes``. Use this to
smoke-test credentials and provider wiring without creating a sandbox.

## Prerequisites

- Node.js 18 or newer (or Bun).
- Provider-specific env vars when you pass a non-local provider name.

## How to run

```bash
npx tsx examples/typescript/swap-provider-cli/index.ts
# optional: pass provider name as argv
```
