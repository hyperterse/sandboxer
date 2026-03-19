# e2b-files

Writes and reads a file in an E2B sandbox over the provider API. Compare with
``local-files`` to see the same file API on a hosted backend.

## Prerequisites

- Node.js 18 or newer (or Bun); ``E2B_API_KEY``; optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
npx tsx examples/typescript/e2b-files/index.ts
```
