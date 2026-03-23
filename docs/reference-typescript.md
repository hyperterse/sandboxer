# TypeScript API reference

This page documents the **`@hyperterse/sandboxer`** npm package
([`sdks/typescript/src`](../sdks/typescript/src/)).

You pick a **provider** name (for example `e2b` or `local`). The client talks
to that host over **HTTPS** with the vendor’s authentication, or runs the
**`docker`** CLI when you use **`local`**. There is no separate Sandboxer
server. You need a global **`fetch`** (Node 18+, Bun, or browsers that expose
`fetch`).

```typescript
import { Sandboxer } from "@hyperterse/sandboxer";

const client = new Sandboxer({
  provider: "e2b",
  config: {
    apiKey: process.env.E2B_API_KEY!,
    baseUrl: process.env.E2B_API_BASE ?? "https://api.e2b.app",
  },
});

const [sb, info] = await client.createSandbox({ timeoutSeconds: 600 });
try {
  const res = await sb.runCommand({ cmd: "echo hello" });
  console.log(res.stdout);
} finally {
  await sb.kill();
  await client.close();
}
```

## Exports

| Symbol | Role |
|--------|------|
| **`Sandboxer`** | `new Sandboxer({ provider, config })` — async provider resolution |
| **`Provider`**, **`Sandbox`** | Interfaces in [`provider.ts`](../sdks/typescript/src/provider.ts) |
| **Types** | [`types.ts`](../sdks/typescript/src/types.ts) — `ProviderName`, requests, responses |
| **Errors** | [`errors.ts`](../sdks/typescript/src/errors.ts) — `SandboxerError`, `SandboxerTimeoutError`, … |
| **`registerProvider`** | [`registry.ts`](../sdks/typescript/src/registry.ts) |

Implementations are registered from
[`providers/index.ts`](../sdks/typescript/src/providers/index.ts).

## Provider names

[`ProviderName`](../sdks/typescript/src/types.ts): **`e2b`**, **`daytona`**, **`blaxel`**, **`runloop`**, **`fly-machines`**, **`local`**.

## `Sandboxer`

| Method | Description |
|--------|-------------|
| `createSandbox(req?)` | **`Promise<[Sandbox, SandboxInfo]>`** |
| `attachSandbox(sandboxId)` | **`Promise<Sandbox>`** |
| `listSandboxes(filter?)` | **`Promise<SandboxInfo[]>`** |
| `killSandbox(sandboxId)` | **`Promise<void>`** |
| `close()` | **`Promise<void>`** |

## `Sandbox`

Lifecycle: **`info`**, **`isRunning`**, **`pause`**, **`resume`**, **`kill`**, **`portUrl`**.

Commands: **`runCommand`**, **`startCommand`**, **`waitForHandle`**, **`killProcess`**, **`listProcesses`**.

Filesystem: **`readFile`**, **`writeFile`**, **`listDirectory`**, **`makeDir`**, **`remove`**, **`exists`**.

PTY: **`createPty`**, **`resizePty`**, **`killPty`**, **`listPty`**.

## Configuration

[`SandboxerConfig`](../sdks/typescript/src/config.ts): **`provider`**, optional
**`config`** with **`apiKey`**, **`baseUrl`**, **`defaultTimeoutMs`**, and
provider-specific fields.

## Errors

[`errors.ts`](../sdks/typescript/src/errors.ts) — inspect **`statusCode`**,
**`body`**, and **`name`** on **`SandboxerError`**.
