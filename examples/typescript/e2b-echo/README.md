# e2b-echo

Creates a sandbox on E2B and runs ``echo``. This is the smallest hosted flow:
you need an E2B API key and network access to the E2B API.

## Prerequisites

- Node.js 18 or newer (or Bun).
- An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.
- Optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
npx tsx examples/typescript/e2b-echo/index.ts
```
