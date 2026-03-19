# config-from-environment

Builds a ``Sandboxer`` from ``SANDBOXER_PROVIDER`` (default ``local``) plus
optional ``SANDBOXER_API_KEY`` and ``SANDBOXER_BASE_URL``. Key and base URL
fallbacks per provider are in ``index.ts``. This sample only calls
``listSandboxes``; it does not create a sandbox.

## Prerequisites

- Node.js 18 or newer (or Bun).
- For ``local``, no API key. For ``e2b``, set ``E2B_API_KEY`` or
  ``SANDBOXER_API_KEY`` and optional ``E2B_API_BASE``.
- Other providers (Daytona, Runloop, Fly, Blaxel) need their respective keys as
  implemented in the source file.

## How to run

```bash
export SANDBOXER_PROVIDER=local
npx tsx examples/typescript/config-from-environment/index.ts
```
