import type { ProviderConfig } from "../config.js";
import type { Provider, Sandbox } from "../provider.js";
import type {
  SandboxInfo,
  CommandResult,
  FileInfo,
  ProcessInfo,
  PTYInfo,
  CreateSandboxRequest,
  RunCommandRequest,
  StartCommandRequest,
  CreatePTYRequest,
  ListSandboxesFilter,
} from "../types.js";
import { registerProvider } from "../registry.js";
import { HttpClient, HTTPError } from "../http-client.js";
import {
  BadConfigError,
  NotFoundError,
  NotSupportedError,
  ProviderError,
} from "../errors.js";
import { firstNonEmpty } from "../util.js";

const DEFAULT_API_BASE = "https://api.machines.dev";

class FlyMachinesProvider implements Provider {
  private hc: HttpClient;
  private token: string;
  private base: string;
  private app: string;

  constructor(hc: HttpClient, token: string, base: string, app: string) {
    this.hc = hc;
    this.token = token;
    this.base = base;
    this.app = app;
  }

  private hdr(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "fly-machines") return [];
    const u = `${this.base}/v1/apps/${encodeURIComponent(this.app)}/machines`;

    let machines: Array<{ id: string; state: string; region: string }>;
    try {
      machines = (await this.hc.do("GET", u, this.hdr())) ?? [];
    } catch (e) {
      throw mapFlyErr(e);
    }

    const out: SandboxInfo[] = [];
    for (const m of machines) {
      const st = (m.state || "").toLowerCase();
      const status: SandboxInfo["status"] =
        st === "stopped" || st === "destroyed" ? "stopped" : "running";
      out.push({
        id: m.id,
        provider: "fly-machines",
        status,
        startedAt: new Date().toISOString(),
        metadata: { region: m.region, app: this.app },
      });
      if (filter?.limit && filter.limit > 0 && out.length >= filter.limit)
        break;
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const u = `${this.base}/v1/apps/${encodeURIComponent(this.app)}/machines/${encodeURIComponent(sandboxId)}?force=true`;
    try {
      await this.hc.do("DELETE", u, this.hdr());
    } catch (e) {
      throw mapFlyErr(e);
    }
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const image = req?.template || "nginx:alpine";
    const cpus = req?.cpus || 1;
    const mem = req?.memoryMb || 256;

    const body = {
      config: {
        image,
        guest: { cpu_kind: "shared", cpus, memory_mb: mem },
        auto_destroy: true,
        auto_start_machines: true,
        restart: { policy: "no" },
        stop_timeout: "60s",
        env: req?.envs,
        metadata: req?.metadata,
      },
      region: firstNonEmpty(process.env.FLY_REGION, "iad"),
    };

    const u = `${this.base}/v1/apps/${encodeURIComponent(this.app)}/machines`;
    let created: { id: string };
    try {
      created = await this.hc.do("POST", u, this.hdr(), body);
    } catch (e) {
      throw mapFlyErr(e);
    }

    const sb = new FlyMachinesSandbox(this, created.id);
    const info: SandboxInfo = {
      id: created.id,
      provider: "fly-machines",
      status: "starting",
      startedAt: new Date().toISOString(),
      template: image,
      metadata: { app: this.app },
      cpus,
      memoryMb: mem,
    };
    return [sb, info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const sb = new FlyMachinesSandbox(this, sandboxId);
    await sb.info(); // validate
    return sb;
  }

  async close(): Promise<void> {}

  getHc(): HttpClient {
    return this.hc;
  }
  getBase(): string {
    return this.base;
  }
  getApp(): string {
    return this.app;
  }
  getHdr(): Record<string, string> {
    return this.hdr();
  }
}

class FlyMachinesSandbox implements Sandbox {
  readonly id: string;
  private provider: FlyMachinesProvider;

  constructor(provider: FlyMachinesProvider, id: string) {
    this.provider = provider;
    this.id = id;
  }

  async info(): Promise<SandboxInfo> {
    const u = `${this.provider.getBase()}/v1/apps/${encodeURIComponent(this.provider.getApp())}/machines/${encodeURIComponent(this.id)}`;
    let m: {
      id: string;
      state: string;
      config: { image: string; guest: { cpus: number; memory_mb: number } };
    };
    try {
      m = await this.provider.getHc().do("GET", u, this.provider.getHdr());
    } catch (e) {
      throw mapFlyErr(e);
    }
    const st = (m.state || "").toLowerCase();
    const info: SandboxInfo = {
      id: m.id,
      provider: "fly-machines",
      status: st === "stopped" ? "stopped" : "running",
      startedAt: new Date().toISOString(),
      metadata: { app: this.provider.getApp() },
    };
    if (m.config?.image) info.template = m.config.image;
    if (m.config?.guest?.cpus > 0) info.cpus = m.config.guest.cpus;
    if (m.config?.guest?.memory_mb > 0)
      info.memoryMb = m.config.guest.memory_mb;
    return info;
  }

  async isRunning(): Promise<boolean> {
    const i = await this.info();
    return i.status === "running";
  }

  async pause(): Promise<void> {
    const u = `${this.provider.getBase()}/v1/apps/${encodeURIComponent(this.provider.getApp())}/machines/${encodeURIComponent(this.id)}/suspend`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapFlyErr(e);
    }
  }

  async resume(): Promise<void> {
    const u = `${this.provider.getBase()}/v1/apps/${encodeURIComponent(this.provider.getApp())}/machines/${encodeURIComponent(this.id)}/start`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapFlyErr(e);
    }
  }

  async kill(): Promise<void> {
    return this.provider.killSandbox(this.id);
  }

  async portUrl(_port: number): Promise<string> {
    throw new NotSupportedError();
  }
  async runCommand(_req: RunCommandRequest): Promise<CommandResult> {
    throw new NotSupportedError();
  }
  async startCommand(
    _req: StartCommandRequest,
  ): Promise<{ pid: number; handleId: string }> {
    throw new NotSupportedError();
  }
  async waitForHandle(_handleId: string): Promise<CommandResult> {
    throw new NotSupportedError();
  }
  async killProcess(_pid: number): Promise<void> {
    throw new NotSupportedError();
  }
  async listProcesses(): Promise<ProcessInfo[]> {
    throw new NotSupportedError();
  }
  async readFile(_path: string): Promise<Uint8Array> {
    throw new NotSupportedError();
  }
  async writeFile(
    _path: string,
    _content: Uint8Array,
    _mode?: number,
    _user?: string,
  ): Promise<void> {
    throw new NotSupportedError();
  }
  async listDirectory(_path: string): Promise<FileInfo[]> {
    throw new NotSupportedError();
  }
  async makeDir(_path: string): Promise<void> {
    throw new NotSupportedError();
  }
  async remove(_path: string): Promise<void> {
    throw new NotSupportedError();
  }
  async exists(_path: string): Promise<boolean> {
    throw new NotSupportedError();
  }
  async createPty(_req: CreatePTYRequest): Promise<PTYInfo> {
    throw new NotSupportedError();
  }
  async resizePty(_pid: number, _rows: number, _cols: number): Promise<void> {
    throw new NotSupportedError();
  }
  async killPty(_pid: number): Promise<void> {
    throw new NotSupportedError();
  }
  async listPty(): Promise<PTYInfo[]> {
    throw new NotSupportedError();
  }
}

function mapFlyErr(e: unknown): Error {
  if (e instanceof HTTPError) {
    if (e.status === 404) return new NotFoundError();
    const msg = new TextDecoder().decode(e.body).slice(0, 400);
    return new ProviderError("fly-machines", msg, e.status);
  }
  return e instanceof Error ? e : new Error(String(e));
}

registerProvider("fly-machines", async (config: ProviderConfig) => {
  const tok = firstNonEmpty(config.apiKey, process.env.FLY_API_TOKEN);
  if (!tok)
    throw new ProviderError(
      "fly-machines",
      "Fly API token required (config.apiKey or FLY_API_TOKEN)",
    );
  const app = firstNonEmpty(
    process.env.FLY_APP_NAME,
    process.env.SANDBOXER_FLY_APP,
  );
  if (!app) throw new BadConfigError("set FLY_APP_NAME or SANDBOXER_FLY_APP");
  const base = (
    config.baseUrl ||
    firstNonEmpty(process.env.FLY_API_HOSTNAME, DEFAULT_API_BASE)
  ).replace(/\/+$/, "");
  const hc = new HttpClient(config.defaultTimeoutMs);
  return new FlyMachinesProvider(hc, tok, base, app);
});
