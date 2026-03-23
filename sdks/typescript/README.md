# Sandboxer (TypeScript)

TypeScript and JavaScript client for Sandboxer. You choose a **provider** (a
sandbox host or local Docker); the library calls that backend directly. There
is no Sandboxer cloud service between your code and the host.

## Package name

The published npm package is **`@hyperterse/sandboxer`** (see [`package.json`](package.json)).

## Install

```bash
npm install @hyperterse/sandboxer
```

From a clone of the monorepo (Bun workspace at the repository root):

```bash
cd /path/to/sandboxer
bun install
bun run build:typescript
```

You can also install from `sdks/typescript` with npm after `npm install` and
`npm run build`.

## Usage

```typescript
import { Sandboxer } from "@hyperterse/sandboxer";

const client = new Sandboxer({
  provider: "e2b",
  config: { apiKey: process.env.E2B_API_KEY!, baseUrl: "https://api.e2b.app" },
});
const [sb, info] = await client.createSandbox();
try {
  console.log((await sb.runCommand({ cmd: "echo hi" })).stdout);
} finally {
  await sb.kill();
  await client.close();
}
```

Full API tables and types:
[TypeScript API reference](../../docs/reference-typescript.md).

## Layout

- Sources: [`src/`](src/)
- Provider drivers: [`src/providers/`](src/providers/)
