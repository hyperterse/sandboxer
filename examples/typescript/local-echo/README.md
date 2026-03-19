# local-echo

Creates a sandbox with the ``local`` provider (Docker on your machine), runs one
``echo`` command, then deletes the sandbox. This is the smallest end-to-end
path: no cloud API key, only the Docker CLI talking to your container engine.
Use it to confirm Sandboxer can provision and tear down workloads.

## Prerequisites

- Node.js 18 or newer with ``npx``, or Bun to run TypeScript directly.
- Docker installed and the daemon running; ``docker info`` must succeed.
- The script imports the SDK from ``sdks/typescript/src``; build the SDK if you
  prefer importing from ``dist``.

## How to run

```bash
npx tsx examples/typescript/local-echo/index.ts
```
