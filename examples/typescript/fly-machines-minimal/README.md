# fly-machines-minimal

Lists Fly Machines for your app using ``listSandboxes`` with a ``limit``. It
does not create a sandbox in this TypeScript sample; compare with the Go and
Python examples that provision a machine.

## Prerequisites

- Node.js 18 or newer (or Bun).
- ``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.
- This sample only lists machines; it does not create one.

## How to run

```bash
export FLY_API_TOKEN=your_token_here
export FLY_APP_NAME=your_app_here
npx tsx examples/typescript/fly-machines-minimal/index.ts
```
