import "./providers/index.js"; // trigger registrations

import type { SandboxerConfig, ProviderConfig } from "./config.js";
import type { Provider, Sandbox } from "./provider.js";
import type {
  SandboxInfo,
  CreateSandboxRequest,
  ListSandboxesFilter,
} from "./types.js";
import { resolveProvider } from "./registry.js";

export class Sandboxer {
  private providerPromise: Promise<Provider>;
  private _provider: Provider | null = null;

  constructor(opts: SandboxerConfig) {
    this.providerPromise = resolveProvider(opts.provider, opts.config || {});
    this.providerPromise.then((p) => {
      this._provider = p;
    });
  }

  private async provider(): Promise<Provider> {
    if (this._provider) return this._provider;
    this._provider = await this.providerPromise;
    return this._provider;
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const p = await this.provider();
    return p.createSandbox(req);
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    const p = await this.provider();
    return p.listSandboxes(filter);
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const p = await this.provider();
    return p.killSandbox(sandboxId);
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const p = await this.provider();
    return p.attachSandbox(sandboxId);
  }

  async close(): Promise<void> {
    const p = await this.provider();
    return p.close();
  }
}

// Re-export everything
export type { Provider, Sandbox } from "./provider.js";
export type { SandboxerConfig, ProviderConfig } from "./config.js";
export * from "./types.js";
export * from "./errors.js";
export { registerProvider, resolveProvider } from "./registry.js";
export { VERSION } from "./version.js";
