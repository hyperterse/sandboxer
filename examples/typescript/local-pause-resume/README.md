# local-pause-resume

Pauses and resumes the container using ``Pause`` / ``pause`` and ``Resume`` /
``resume`` (Docker pause and unpause). Not every hosted provider supports this;
the local driver maps it to ``docker pause`` and ``docker unpause``.

## Prerequisites

- Node.js 18 or newer (or Bun) and Docker.

## How to run

```bash
npx tsx examples/typescript/local-pause-resume/index.ts
```
