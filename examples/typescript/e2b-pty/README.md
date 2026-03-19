# e2b-pty

Attempts to open a PTY session on E2B. Depending on the driver version, this may
still return ``ErrNotSupported`` / ``NotSupportedError``; the sample prints a
clear message when PTY is not wired for that backend.

## Prerequisites

- Node.js 18 or newer (or Bun); ``E2B_API_KEY``.

## How to run

```bash
export E2B_API_KEY=your_key_here
npx tsx examples/typescript/e2b-pty/index.ts
```
