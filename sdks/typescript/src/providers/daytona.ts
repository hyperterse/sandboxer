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
import { NotFoundError, NotSupportedError, ProviderError } from "../errors.js";
import { firstNonEmpty } from "../util.js";

const DEFAULT_API_BASE = "https://app.daytona.io/api";
const DEFAULT_TOOLBOX_BASE = "https://proxy.app.daytona.io/toolbox";

class DaytonaProvider implements Provider {
  private hc: HttpClient;
  private token: string;
  private apiBase: string;
  private toolBase: string;

  constructor(
    hc: HttpClient,
    token: string,
    apiBase: string,
    toolBase: string,
  ) {
    this.hc = hc;
    this.token = token;
    this.apiBase = apiBase;
    this.toolBase = toolBase;
  }

  private hdr(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "daytona") return [];
    let u = `${this.apiBase}/sandbox`;
    if (filter?.limit && filter.limit > 0) u += `?limit=${filter.limit}`;

    let rows: Array<{
      id: string;
      name: string;
      state: string;
      image: string;
      labels?: Record<string, string>;
    }>;
    try {
      rows = (await this.hc.do("GET", u, this.hdr())) ?? [];
    } catch (e) {
      throw mapDaytonaErr(e);
    }

    const out: SandboxInfo[] = [];
    for (const s of rows) {
      if (filter?.metadataFilter && !metaHas(s.labels, filter.metadataFilter))
        continue;
      const info: SandboxInfo = {
        id: s.id || s.name,
        provider: "daytona",
        status: mapDaytonaStatus(s.state),
        startedAt: new Date().toISOString(),
        metadata: s.labels,
      };
      if (s.image) info.template = s.image;
      out.push(info);
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const u = `${this.apiBase}/sandbox/${encodeURIComponent(sandboxId)}`;
    try {
      await this.hc.do("DELETE", u, this.hdr());
    } catch (e) {
      throw mapDaytonaErr(e);
    }
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const body: Record<string, unknown> = { env: req?.metadata };
    if (req?.template) body.image = req.template;
    if (req?.envs && Object.keys(req.envs).length > 0) body.envVars = req.envs;
    if (req?.cpus || req?.memoryMb) {
      const res: Record<string, unknown> = {};
      if (req?.cpus) res.cpu = req.cpus;
      if (req?.memoryMb) res.memory = req.memoryMb;
      body.resources = res;
    }

    let created: { id: string; name: string; state: string; image: string };
    try {
      created = await this.hc.do(
        "POST",
        `${this.apiBase}/sandbox`,
        this.hdr(),
        body,
      );
    } catch (e) {
      throw mapDaytonaErr(e);
    }

    const id = created.id || created.name;
    const sb = new DaytonaSandbox(this, id);
    let info: SandboxInfo;
    try {
      info = await sb.info();
    } catch {
      info = {
        id,
        provider: "daytona",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      if (created.image) info.template = created.image;
    }
    return [sb, info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const sb = new DaytonaSandbox(this, sandboxId);
    await sb.info(); // validate existence
    return sb;
  }

  async close(): Promise<void> {}

  getHc(): HttpClient {
    return this.hc;
  }
  getApiBase(): string {
    return this.apiBase;
  }
  getToolBase(): string {
    return this.toolBase;
  }
  getHdr(): Record<string, string> {
    return this.hdr();
  }
}

class DaytonaSandbox implements Sandbox {
  readonly id: string;
  private provider: DaytonaProvider;

  constructor(provider: DaytonaProvider, id: string) {
    this.provider = provider;
    this.id = id;
  }

  async info(): Promise<SandboxInfo> {
    const u = `${this.provider.getApiBase()}/sandbox/${encodeURIComponent(this.id)}`;
    let d: { id: string; name: string; state: string; image: string };
    try {
      d = await this.provider.getHc().do("GET", u, this.provider.getHdr());
    } catch (e) {
      throw mapDaytonaErr(e);
    }
    const info: SandboxInfo = {
      id: d.id || d.name,
      provider: "daytona",
      status: mapDaytonaStatus(d.state),
      startedAt: new Date().toISOString(),
    };
    if (d.image) info.template = d.image;
    return info;
  }

  async isRunning(): Promise<boolean> {
    const i = await this.info();
    return i.status === "running" || i.status === "starting";
  }

  async pause(): Promise<void> {
    const u = `${this.provider.getApiBase()}/sandbox/${encodeURIComponent(this.id)}/stop`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapDaytonaErr(e);
    }
  }

  async resume(): Promise<void> {
    const u = `${this.provider.getApiBase()}/sandbox/${encodeURIComponent(this.id)}/start`;
    try {
      await this.provider.getHc().do("POST", u, this.provider.getHdr(), {});
    } catch (e) {
      throw mapDaytonaErr(e);
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
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/process/execute`;
    const body: Record<string, unknown> = { command: req.cmd };
    if (req.cwd) body.cwd = req.cwd;
    if (req.timeoutSeconds) body.timeout = req.timeoutSeconds;
    if (req.env && Object.keys(req.env).length > 0) body.env = req.env;

    let out: {
      exitCode: number;
      exit_code: number;
      result: string;
      stdout: string;
      stderr: string;
    };
    try {
      out = await this.provider
        .getHc()
        .do("POST", u, this.provider.getHdr(), body);
    } catch (e) {
      throw mapDaytonaErr(e);
    }

    const code = out.exitCode || out.exit_code || 0;
    const stdout = out.stdout || out.result || "";
    return {
      stdout,
      stderr: out.stderr || "",
      exitCode: code,
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
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files/download?path=${encodeURIComponent(path)}`;
    try {
      const resp = await this.provider
        .getHc()
        .doRaw("GET", u, this.provider.getHdr());
      return resp.body;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) throw new NotFoundError();
      throw mapDaytonaErr(e);
    }
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    _mode?: number,
    _user?: string,
  ): Promise<void> {
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files/upload?path=${encodeURIComponent(path)}`;
    const boundary = "----SandboxerBoundary" + Date.now().toString(36);
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];

    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${path}\r\n`,
      ),
    );
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="file"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
    );
    parts.push(content);
    parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

    let totalLen = 0;
    for (const p of parts) totalLen += p.length;
    const body = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      body.set(p, offset);
      offset += p.length;
    }

    try {
      await this.provider
        .getHc()
        .doRaw(
          "POST",
          u,
          this.provider.getHdr(),
          body,
          `multipart/form-data; boundary=${boundary}`,
        );
    } catch (e) {
      throw mapDaytonaErr(e);
    }
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files?path=${encodeURIComponent(path)}`;
    let raw: Uint8Array;
    try {
      const resp = await this.provider
        .getHc()
        .doRaw("GET", u, this.provider.getHdr());
      raw = resp.body;
    } catch (e) {
      throw mapDaytonaErr(e);
    }

    const text = new TextDecoder().decode(raw);
    let entries: Array<{
      name: string;
      path: string;
      isDir: boolean;
      size: number;
    }>;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        entries = parsed;
      } else if (parsed.entries) {
        entries = parsed.entries;
      } else {
        entries = [];
      }
    } catch {
      entries = [];
    }

    return entries.map((e) => ({
      name: e.name,
      path: e.path || `${path}/${e.name}`,
      isDir: e.isDir ?? false,
      size: e.size ?? 0,
    }));
  }

  async makeDir(path: string): Promise<void> {
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files/folder?path=${encodeURIComponent(path)}&mode=755`;
    try {
      await this.provider.getHc().doRaw("POST", u, this.provider.getHdr());
    } catch (e) {
      throw mapDaytonaErr(e);
    }
  }

  async remove(path: string): Promise<void> {
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files?path=${encodeURIComponent(path)}`;
    try {
      await this.provider.getHc().doRaw("DELETE", u, this.provider.getHdr());
    } catch (e) {
      throw mapDaytonaErr(e);
    }
  }

  async exists(path: string): Promise<boolean> {
    const u = `${this.provider.getToolBase()}/${encodeURIComponent(this.id)}/files/info?path=${encodeURIComponent(path)}`;
    try {
      await this.provider.getHc().doRaw("GET", u, this.provider.getHdr());
      return true;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) return false;
      throw mapDaytonaErr(e);
    }
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

function mapDaytonaStatus(state: string): SandboxInfo["status"] {
  switch ((state || "").toLowerCase()) {
    case "stopped":
    case "archived":
      return "stopped";
    case "starting":
    case "creating":
      return "starting";
    default:
      return "running";
  }
}

function metaHas(
  m: Record<string, string> | undefined,
  needle: string,
): boolean {
  if (!needle || !m) return !needle;
  for (const v of Object.values(m)) {
    if (v.includes(needle)) return true;
  }
  return false;
}

function mapDaytonaErr(e: unknown): Error {
  if (e instanceof HTTPError) {
    if (e.status === 404) return new NotFoundError();
    const msg = new TextDecoder().decode(e.body);
    return new ProviderError("daytona", msg, e.status);
  }
  return e instanceof Error ? e : new Error(String(e));
}

registerProvider("daytona", async (config: ProviderConfig) => {
  const tok = firstNonEmpty(
    config.apiKey,
    process.env.DAYTONA_API_KEY,
    process.env.DAYTONA_TOKEN,
  );
  if (!tok)
    throw new ProviderError(
      "daytona",
      "Daytona API token required (config.apiKey or DAYTONA_API_KEY)",
    );
  const apiBase = (config.baseUrl || DEFAULT_API_BASE).replace(/\/+$/, "");
  const toolBase = (
    process.env.DAYTONA_TOOLBOX_BASE_URL || DEFAULT_TOOLBOX_BASE
  ).replace(/\/+$/, "");
  const hc = new HttpClient(config.defaultTimeoutMs);
  return new DaytonaProvider(hc, tok, apiBase, toolBase);
});
