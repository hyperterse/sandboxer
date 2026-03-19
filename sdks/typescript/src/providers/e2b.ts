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
import { unaryPost, streamPost } from "../connect-proto.js";
import { NotFoundError, NotSupportedError, ProviderError } from "../errors.js";
import { firstNonEmpty, shellQuote } from "../util.js";

const DEFAULT_API_BASE = "https://api.e2b.app";
const DEFAULT_ENVD_PORT = 49983;
const HEADER_API_KEY = "X-API-Key";
const HEADER_ACCESS_TOKEN = "X-Access-Token";

class E2BProvider implements Provider {
  private hc: HttpClient;
  private apiKey: string;
  private apiBase: string;
  private port: number;
  private tpl: string;

  constructor(
    hc: HttpClient,
    apiKey: string,
    apiBase: string,
    port: number,
    tpl: string,
  ) {
    this.hc = hc;
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.port = port;
    this.tpl = tpl;
  }

  private apiHeaders(): Record<string, string> {
    return { [HEADER_API_KEY]: this.apiKey };
  }

  envdBase(sandboxId: string): string {
    return `https://${this.port}-${sandboxId}.e2b.app`;
  }

  envdHeaders(token?: string): Record<string, string> {
    const h: Record<string, string> = {};
    if (token) h[HEADER_ACCESS_TOKEN] = token;
    return h;
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "e2b") return [];
    let u = `${this.apiBase}/v2/sandboxes`;
    if (filter?.limit && filter.limit > 0) u += `?limit=${filter.limit}`;

    const listed = await this.hc.do<
      Array<{
        templateID: string;
        sandboxID: string;
        startedAt: string;
        endAt: string;
        state: string;
        metadata: Record<string, string>;
        cpuCount: number;
        memoryMB: number;
      }>
    >("GET", u, this.apiHeaders());

    const out: SandboxInfo[] = [];
    for (const s of listed ?? []) {
      if (
        filter?.metadataFilter &&
        !metadataMatch(s.metadata, filter.metadataFilter)
      )
        continue;
      const info: SandboxInfo = {
        id: s.sandboxID,
        provider: "e2b",
        template: s.templateID,
        status: s.state === "paused" ? "paused" : "running",
        startedAt: s.startedAt || new Date().toISOString(),
        metadata: s.metadata,
      };
      if (s.endAt) info.expiresAt = s.endAt;
      if (s.cpuCount > 0) info.cpus = s.cpuCount;
      if (s.memoryMB > 0) info.memoryMb = s.memoryMB;
      out.push(info);
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const u = `${this.apiBase}/sandboxes/${encodeURIComponent(sandboxId)}`;
    try {
      await this.hc.do("DELETE", u, this.apiHeaders());
    } catch (e) {
      throw mapE2BErr(e);
    }
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const tpl = req?.template || this.tpl;
    const body: Record<string, unknown> = {
      templateID: tpl,
      metadata: req?.metadata,
      envVars: req?.envs,
    };
    if (req?.timeoutSeconds) body.timeout = req.timeoutSeconds;
    if (req?.cpus) body.cpuCount = req.cpus;
    if (req?.memoryMb) body.memoryMB = req.memoryMb;

    let created: {
      sandboxID: string;
      templateID: string;
      envdAccessToken?: string;
      trafficAccessToken?: string;
    };
    try {
      created = await this.hc.do(
        "POST",
        `${this.apiBase}/sandboxes`,
        this.apiHeaders(),
        body,
      );
    } catch (e) {
      throw mapE2BErr(e);
    }

    const detail = await this.getSandboxDetail(created.sandboxID);
    const info = detailToInfo(detail, tpl);
    const sb = new E2BSandbox(this, created.sandboxID, created.envdAccessToken);
    return [sb, info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const detail = await this.getSandboxDetail(sandboxId);
    return new E2BSandbox(this, sandboxId, detail.envdAccessToken);
  }

  async close(): Promise<void> {}

  async getSandboxDetail(id: string): Promise<E2BSandboxDetail> {
    const u = `${this.apiBase}/sandboxes/${encodeURIComponent(id)}`;
    try {
      return await this.hc.do<E2BSandboxDetail>("GET", u, this.apiHeaders());
    } catch (e) {
      throw mapE2BErr(e);
    }
  }

  getHc(): HttpClient {
    return this.hc;
  }
  getTpl(): string {
    return this.tpl;
  }
}

interface E2BSandboxDetail {
  sandboxID: string;
  templateID: string;
  startedAt: string;
  endAt: string;
  state: string;
  metadata: Record<string, string>;
  cpuCount: number;
  memoryMB: number;
  envdAccessToken?: string;
}

function detailToInfo(d: E2BSandboxDetail, fallbackTpl: string): SandboxInfo {
  const tpl = d.templateID || fallbackTpl;
  const info: SandboxInfo = {
    id: d.sandboxID,
    provider: "e2b",
    template: tpl,
    status: d.state === "paused" ? "paused" : "running",
    startedAt: d.startedAt || new Date().toISOString(),
    metadata: d.metadata,
  };
  if (d.endAt) info.expiresAt = d.endAt;
  if (d.cpuCount > 0) info.cpus = d.cpuCount;
  if (d.memoryMB > 0) info.memoryMb = d.memoryMB;
  return info;
}

class E2BSandbox implements Sandbox {
  readonly id: string;
  private provider: E2BProvider;
  private token?: string;

  constructor(provider: E2BProvider, id: string, token?: string) {
    this.provider = provider;
    this.id = id;
    this.token = token;
  }

  async info(): Promise<SandboxInfo> {
    const d = await this.provider.getSandboxDetail(this.id);
    return detailToInfo(d, this.provider.getTpl());
  }

  async isRunning(): Promise<boolean> {
    const d = await this.provider.getSandboxDetail(this.id);
    return d.state === "running";
  }

  async pause(): Promise<void> {
    const u = `${(this.provider as E2BProvider)["apiBase"]}/sandboxes/${encodeURIComponent(this.id)}/pause`;
    try {
      await this.provider
        .getHc()
        .do(
          "POST",
          u,
          { [HEADER_API_KEY]: (this.provider as E2BProvider)["apiKey"] },
          {},
        );
    } catch (e) {
      throw mapE2BErr(e);
    }
  }

  async resume(): Promise<void> {
    const u = `${(this.provider as E2BProvider)["apiBase"]}/sandboxes/${encodeURIComponent(this.id)}/resume`;
    try {
      await this.provider
        .getHc()
        .do(
          "POST",
          u,
          { [HEADER_API_KEY]: (this.provider as E2BProvider)["apiKey"] },
          {},
        );
    } catch (e) {
      throw mapE2BErr(e);
    }
  }

  async kill(): Promise<void> {
    return this.provider.killSandbox(this.id);
  }

  async portUrl(port: number): Promise<string> {
    return `https://${port}-${this.id}.e2b.app`;
  }

  async runCommand(req: RunCommandRequest): Promise<CommandResult> {
    const start = Date.now();
    const u = this.provider.envdBase(this.id) + "/process.Process/Start";
    const h = this.provider.envdHeaders(this.token);
    if (req.timeoutSeconds && req.timeoutSeconds > 0) {
      h["Connect-Timeout-Ms"] = String(req.timeoutSeconds * 1000);
    }
    const proc: Record<string, unknown> = {
      cmd: "sh",
      args: ["-c", req.cmd],
      envs: req.env,
    };
    if (req.cwd) proc.cwd = req.cwd;
    const body = { process: proc };

    let stdout = "";
    let stderr = "";
    let exit = 0;
    let sawEnd = false;

    await streamPost(this.provider.getHc(), u, h, body, (msg: unknown) => {
      const m = msg as {
        event?: {
          data?: { stdout?: string; stderr?: string };
          end?: { exit_code?: number; exitCode?: number };
        };
      };
      if (m.event?.data) {
        if (m.event.data.stdout) {
          try {
            stdout += atob(m.event.data.stdout);
          } catch {
            stdout += m.event.data.stdout;
          }
        }
        if (m.event.data.stderr) {
          try {
            stderr += atob(m.event.data.stderr);
          } catch {
            stderr += m.event.data.stderr;
          }
        }
      }
      if (m.event?.end) {
        const ec = m.event.end.exitCode ?? m.event.end.exit_code ?? 0;
        exit = ec;
        sawEnd = true;
      }
    });

    if (!sawEnd) exit = -1;

    return {
      stdout,
      stderr,
      exitCode: exit,
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
    const u =
      this.provider.envdBase(this.id) +
      "/files?path=" +
      encodeURIComponent(path);
    const h = this.provider.envdHeaders(this.token);
    try {
      const resp = await this.provider.getHc().doRaw("GET", u, h);
      return resp.body;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) throw new NotFoundError();
      throw mapE2BErr(e);
    }
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    _mode?: number,
    _user?: string,
  ): Promise<void> {
    const u = this.provider.envdBase(this.id) + "/files";
    const h = this.provider.envdHeaders(this.token);
    const boundary = "----SandboxerBoundary" + Date.now().toString(36);
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];

    // path field
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${path}\r\n`,
      ),
    );
    // file field
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`,
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
        .doRaw("POST", u, h, body, `multipart/form-data; boundary=${boundary}`);
    } catch (e) {
      throw mapE2BErr(e);
    }
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    const u =
      this.provider.envdBase(this.id) + "/filesystem.Filesystem/ListDir";
    const h = this.provider.envdHeaders(this.token);
    const out = await unaryPost<{
      entries?: Array<{
        name: string;
        path: string;
        type: string;
        size: number | string;
        mode?: number;
      }>;
    }>(this.provider.getHc(), u, h, { path, depth: 1 });
    const res: FileInfo[] = [];
    for (const e of out?.entries ?? []) {
      let size = 0;
      if (typeof e.size === "number") size = e.size;
      else if (typeof e.size === "string") size = parseInt(e.size, 10) || 0;
      res.push({
        name: e.name,
        path: e.path,
        isDir: (e.type || "").includes("DIRECTORY"),
        size,
        mode: e.mode || undefined,
      });
    }
    return res;
  }

  async makeDir(path: string): Promise<void> {
    const u =
      this.provider.envdBase(this.id) + "/filesystem.Filesystem/MakeDir";
    const h = this.provider.envdHeaders(this.token);
    await unaryPost(this.provider.getHc(), u, h, { path });
  }

  async remove(path: string): Promise<void> {
    await this.runCommand({ cmd: "rm -rf " + shellQuote(path) });
  }

  async exists(path: string): Promise<boolean> {
    const u =
      this.provider.envdBase(this.id) +
      "/files?path=" +
      encodeURIComponent(path);
    const h = this.provider.envdHeaders(this.token);
    try {
      await this.provider.getHc().doRaw("GET", u, h);
      return true;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) return false;
      throw mapE2BErr(e);
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

function metadataMatch(
  m: Record<string, string> | undefined,
  needle: string,
): boolean {
  if (!needle || !m) return !needle;
  for (const v of Object.values(m)) {
    if (v.includes(needle)) return true;
  }
  return false;
}

function mapE2BErr(e: unknown): Error {
  if (e instanceof HTTPError) {
    if (e.status === 404) return new NotFoundError();
    const msg = new TextDecoder().decode(e.body).slice(0, 256);
    return new ProviderError("e2b", msg, e.status);
  }
  return e instanceof Error ? e : new Error(String(e));
}

registerProvider("e2b", async (config: ProviderConfig) => {
  const key = firstNonEmpty(config.apiKey, process.env.E2B_API_KEY);
  if (!key)
    throw new ProviderError(
      "e2b",
      "E2B API key required (config.apiKey or E2B_API_KEY)",
    );
  const base = (config.baseUrl || DEFAULT_API_BASE).replace(/\/+$/, "");
  let port = DEFAULT_ENVD_PORT;
  const envPort = process.env.E2B_ENVD_PORT;
  if (envPort) {
    const n = parseInt(envPort, 10);
    if (!isNaN(n)) port = n;
  }
  const tpl = process.env.E2B_TEMPLATE_ID || "base";
  const hc = new HttpClient(config.defaultTimeoutMs);
  return new E2BProvider(hc, key, base, port, tpl);
});
