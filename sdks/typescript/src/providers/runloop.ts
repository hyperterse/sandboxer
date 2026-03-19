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
  SandboxStatus,
} from "../types.js";
import { registerProvider } from "../registry.js";
import { HttpClient, HTTPError } from "../http-client.js";
import { NotFoundError, NotSupportedError, ProviderError } from "../errors.js";
import { firstNonEmpty, shellQuote } from "../util.js";

const DEFAULT_API_BASE = "https://api.runloop.ai";

function mapRunloopStatus(s: string): SandboxStatus {
  switch ((s || "").toLowerCase()) {
    case "suspended":
    case "suspending":
      return "paused";
    case "shutdown":
    case "failure":
      return "stopped";
    case "provisioning":
    case "initializing":
    case "resuming":
      return "starting";
    default:
      return "running";
  }
}

class RunloopProvider implements Provider {
  private hc: HttpClient;
  private token: string;
  private base: string;

  constructor(hc: HttpClient, token: string, base: string) {
    this.hc = hc;
    this.token = token;
    this.base = base;
  }

  private hdr(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "runloop") return [];
    const u = `${this.base}/v1/devboxes?limit=5000`;
    let page: { devboxes: Array<{ id: string; name: string; status: string }> };
    try {
      page = await this.hc.do("GET", u, this.hdr());
    } catch (e) {
      throw mapRunloopErr(e);
    }

    const out: SandboxInfo[] = [];
    for (const d of page?.devboxes ?? []) {
      const info: SandboxInfo = {
        id: d.id,
        provider: "runloop",
        status: mapRunloopStatus(d.status),
        startedAt: new Date().toISOString(),
      };
      if (d.name) info.template = d.name;
      out.push(info);
      if (filter?.limit && filter.limit > 0 && out.length >= filter.limit)
        break;
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const u = `${this.base}/v1/devboxes/${encodeURIComponent(sandboxId)}/shutdown`;
    try {
      await this.hc.do("POST", u, this.hdr(), {});
    } catch (e) {
      throw mapRunloopErr(e);
    }
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const body: Record<string, unknown> = {};
    if (req?.template) body.blueprint_name = req.template;
    if (req?.envs && Object.keys(req.envs).length > 0)
      body.environment_variables = req.envs;
    if (req?.metadata) body.metadata = req.metadata;

    let created: { id: string; name: string; status: string };
    try {
      created = await this.hc.do(
        "POST",
        `${this.base}/v1/devboxes`,
        this.hdr(),
        body,
      );
    } catch (e) {
      throw mapRunloopErr(e);
    }

    const sb = new RunloopSandbox(this, created.id);
    const info: SandboxInfo = {
      id: created.id,
      provider: "runloop",
      status: mapRunloopStatus(created.status),
      startedAt: new Date().toISOString(),
    };
    if (created.name) info.template = created.name;
    else if (req?.template) info.template = req.template;
    return [sb, info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const sb = new RunloopSandbox(this, sandboxId);
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
  getHdr(): Record<string, string> {
    return this.hdr();
  }
}

class RunloopSandbox implements Sandbox {
  readonly id: string;
  private provider: RunloopProvider;

  constructor(provider: RunloopProvider, id: string) {
    this.provider = provider;
    this.id = id;
  }

  async info(): Promise<SandboxInfo> {
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}`;
    let d: { id: string; name: string; status: string };
    try {
      d = await this.provider.getHc().do("GET", u, this.provider.getHdr());
    } catch (e) {
      throw mapRunloopErr(e);
    }
    const info: SandboxInfo = {
      id: d.id,
      provider: "runloop",
      status: mapRunloopStatus(d.status),
      startedAt: new Date().toISOString(),
    };
    if (d.name) info.template = d.name;
    return info;
  }

  async isRunning(): Promise<boolean> {
    const i = await this.info();
    return i.status === "running";
  }

  async pause(): Promise<void> {
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}/suspend`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapRunloopErr(e);
    }
  }

  async resume(): Promise<void> {
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}/resume`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapRunloopErr(e);
    }
  }

  async kill(): Promise<void> {
    return this.provider.killSandbox(this.id);
  }

  async portUrl(_port: number): Promise<string> {
    throw new NotSupportedError();
  }

  async runCommand(req: RunCommandRequest): Promise<CommandResult> {
    const start = Date.now();
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}/execute_sync`;
    const body: Record<string, unknown> = { command: req.cmd };
    const shellName = process.env.RUNLOOP_SHELL_NAME;
    if (shellName) body.shell_name = shellName;

    let out: { stdout: string; stderr: string; exit_status: number };
    try {
      out = await this.provider
        .getHc()
        .do("POST", u, this.provider.getHdr(), body);
    } catch (e) {
      throw mapRunloopErr(e);
    }
    return {
      stdout: out.stdout || "",
      stderr: out.stderr || "",
      exitCode: out.exit_status ?? 0,
      durationMs: Date.now() - start,
    };
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

  async readFile(path: string): Promise<Uint8Array> {
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}/read_file_contents`;
    let out: { contents: string };
    try {
      out = await this.provider
        .getHc()
        .do("POST", u, this.provider.getHdr(), { file_path: path });
    } catch (e) {
      throw mapRunloopErr(e);
    }
    return new TextEncoder().encode(out.contents || "");
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    _mode?: number,
    _user?: string,
  ): Promise<void> {
    const u = `${this.provider.getBase()}/v1/devboxes/${encodeURIComponent(this.id)}/write_file_contents`;
    const text = new TextDecoder().decode(content);
    try {
      await this.provider
        .getHc()
        .do("POST", u, this.provider.getHdr(), {
          file_path: path,
          contents: text,
        });
    } catch (e) {
      throw mapRunloopErr(e);
    }
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    const res = await this.runCommand({ cmd: "ls -1 " + shellQuote(path) });
    if (res.exitCode !== 0) throw new Error(`ls failed: ${res.stderr}`);
    const out: FileInfo[] = [];
    for (const line of res.stdout.trim().split("\n")) {
      const name = line.trim();
      if (!name) continue;
      out.push({
        name,
        path: path.replace(/\/+$/, "") + "/" + name,
        isDir: false,
        size: 0,
      });
    }
    return out;
  }

  async makeDir(path: string): Promise<void> {
    await this.runCommand({ cmd: "mkdir -p " + shellQuote(path) });
  }

  async remove(path: string): Promise<void> {
    await this.runCommand({ cmd: "rm -rf " + shellQuote(path) });
  }

  async exists(path: string): Promise<boolean> {
    const res = await this.runCommand({
      cmd: "test -e " + shellQuote(path) + " && echo yes || echo no",
    });
    return res.stdout.trim() === "yes";
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

function mapRunloopErr(e: unknown): Error {
  if (e instanceof HTTPError) {
    if (e.status === 404) return new NotFoundError();
    const msg = new TextDecoder().decode(e.body).slice(0, 512);
    return new ProviderError("runloop", msg, e.status);
  }
  return e instanceof Error ? e : new Error(String(e));
}

registerProvider("runloop", async (config: ProviderConfig) => {
  const tok = firstNonEmpty(config.apiKey, process.env.RUNLOOP_API_KEY);
  if (!tok)
    throw new ProviderError(
      "runloop",
      "Runloop API key required (config.apiKey or RUNLOOP_API_KEY)",
    );
  const base = (config.baseUrl || DEFAULT_API_BASE).replace(/\/+$/, "");
  const hc = new HttpClient(config.defaultTimeoutMs);
  return new RunloopProvider(hc, tok, base);
});
