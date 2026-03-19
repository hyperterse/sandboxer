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
import { firstNonEmpty } from "../util.js";

const DEFAULT_CONTROL_PLANE = "https://api.blaxel.ai/v0";

type BlaxelSandboxRow = {
  metadata?: {
    name?: string;
    url?: string;
    labels?: Record<string, string>;
    createdAt?: string;
  };
  spec?: {
    runtime?: {
      image?: string;
      memory?: number;
    };
  };
  status?: string;
};

type BlaxelDirectory = {
  name?: string;
  path?: string;
  files?: Array<{
    name: string;
    path: string;
    size?: number;
  }>;
  subdirectories?: Array<{ name: string; path: string }>;
};

type BlaxelProcessResponse = {
  pid?: string;
  command?: string;
  exitCode?: number;
  status?: string;
  stdout?: string;
  stderr?: string;
  logs?: string;
  workingDir?: string;
};

class BlaxelProvider implements Provider {
  private hc: HttpClient;
  private token: string;
  private controlBase: string;
  private workspace: string;

  constructor(
    hc: HttpClient,
    token: string,
    controlBase: string,
    workspace: string,
  ) {
    this.hc = hc;
    this.token = token;
    this.controlBase = controlBase;
    this.workspace = workspace;
  }

  private controlHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (this.workspace) h["X-Blaxel-Workspace"] = this.workspace;
    return h;
  }

  private sandboxHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  getHc(): HttpClient {
    return this.hc;
  }

  getControlBase(): string {
    return this.controlBase;
  }

  getSandboxHeaders(): Record<string, string> {
    return this.sandboxHeaders();
  }

  getControlHeaders(): Record<string, string> {
    return this.controlHeaders();
  }

  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "blaxel") return [];
    const u = `${this.controlBase}/sandboxes`;
    let rows: BlaxelSandboxRow[];
    try {
      rows = (await this.hc.do("GET", u, this.controlHeaders())) ?? [];
    } catch (e) {
      throw mapBlaxelErr(e);
    }
    if (!Array.isArray(rows)) return [];

    const out: SandboxInfo[] = [];
    for (const s of rows) {
      const name = s.metadata?.name;
      if (!name) continue;
      if (filter?.metadataFilter) {
        const labels = s.metadata?.labels ?? {};
        const hay = [...Object.values(labels), name].join(" ");
        if (!hay.includes(filter.metadataFilter)) continue;
      }
      const info = sandboxRowToInfo(s, name);
      out.push(info);
      if (filter?.limit && filter.limit > 0 && out.length >= filter.limit)
        break;
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    const u = `${this.controlBase}/sandboxes/${encodeURIComponent(sandboxId)}`;
    try {
      await this.hc.do("DELETE", u, this.controlHeaders());
    } catch (e) {
      throw mapBlaxelErr(e);
    }
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const name =
      (req?.metadata &&
        (req.metadata["name"] ?? req.metadata["sandboxName"])) ||
      `sandboxer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const runtime: Record<string, unknown> = {
      image: req?.template || "blaxel/base-image:latest",
    };
    if (req?.memoryMb) runtime.memory = req.memoryMb;
    else if (req?.cpus) runtime.memory = req.cpus * 2048;
    else runtime.memory = 4096;

    if (req?.envs && Object.keys(req.envs).length > 0) {
      runtime.envs = Object.entries(req.envs).map(([n, value]) => ({
        name: n,
        value,
      }));
    }

    const body: Record<string, unknown> = {
      metadata: {
        name,
        ...(req?.metadata ? { labels: stripNameLabels(req.metadata) } : {}),
      },
      spec: { runtime },
    };

    const q =
      req?.metadata && req.metadata["createIfNotExist"] === "true"
        ? "?createIfNotExist=true"
        : "";

    let created: BlaxelSandboxRow;
    try {
      created = await this.hc.do(
        "POST",
        `${this.controlBase}/sandboxes${q}`,
        this.controlHeaders(),
        body,
      );
    } catch (e) {
      throw mapBlaxelErr(e);
    }

    let baseUrl = normalizeBaseUrl(created.metadata?.url);
    if (!baseUrl) {
      try {
        const again = await this.hc.do(
          "GET",
          `${this.controlBase}/sandboxes/${encodeURIComponent(name)}`,
          this.controlHeaders(),
        );
        baseUrl = normalizeBaseUrl((again as BlaxelSandboxRow).metadata?.url);
      } catch (e) {
        throw mapBlaxelErr(e);
      }
    }
    if (!baseUrl) {
      throw new ProviderError(
        "blaxel",
        "sandbox created but no endpoint URL in response (metadata.url)",
      );
    }

    const sb = new BlaxelSandbox(this, name, baseUrl);
    const info = sandboxRowToInfo(created, name);
    return [sb, info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const u = `${this.controlBase}/sandboxes/${encodeURIComponent(sandboxId)}`;
    let row: BlaxelSandboxRow;
    try {
      row = await this.hc.do("GET", u, this.controlHeaders());
    } catch (e) {
      throw mapBlaxelErr(e);
    }
    const name = row.metadata?.name ?? sandboxId;
    const baseUrl = normalizeBaseUrl(row.metadata?.url);
    if (!baseUrl) {
      throw new ProviderError(
        "blaxel",
        "sandbox has no endpoint URL (metadata.url); cannot attach",
      );
    }
    return new BlaxelSandbox(this, name, baseUrl);
  }

  async close(): Promise<void> {}
}

class BlaxelSandbox implements Sandbox {
  readonly id: string;
  private provider: BlaxelProvider;
  private baseUrl: string;

  constructor(provider: BlaxelProvider, id: string, baseUrl: string) {
    this.provider = provider;
    this.id = id;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private fsUrl(path: string): string {
    const enc = encodeFsPath(path);
    return `${this.baseUrl}/filesystem/${enc}`;
  }

  async info(): Promise<SandboxInfo> {
    const u = `${this.provider.getControlBase()}/sandboxes/${encodeURIComponent(this.id)}`;
    let row: BlaxelSandboxRow;
    try {
      row = await this.provider
        .getHc()
        .do("GET", u, this.provider.getControlHeaders());
    } catch (e) {
      throw mapBlaxelErr(e);
    }
    return sandboxRowToInfo(row, this.id);
  }

  async isRunning(): Promise<boolean> {
    const i = await this.info();
    return i.status === "running" || i.status === "starting";
  }

  async pause(): Promise<void> {
    throw new NotSupportedError("blaxel: pause not supported by API");
  }

  async resume(): Promise<void> {
    throw new NotSupportedError("blaxel: resume not supported by API");
  }

  async kill(): Promise<void> {
    await this.provider.killSandbox(this.id);
  }

  async portUrl(port: number): Promise<string> {
    return `${this.baseUrl}/port/${port}`;
  }

  async runCommand(req: RunCommandRequest): Promise<CommandResult> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      command: req.cmd,
      waitForCompletion: true,
    };
    if (req.cwd) body.workingDir = req.cwd;
    if (req.timeoutSeconds) body.timeout = req.timeoutSeconds;
    if (req.env && Object.keys(req.env).length > 0) body.env = req.env;

    let out: BlaxelProcessResponse;
    try {
      out = await this.provider
        .getHc()
        .do(
          "POST",
          `${this.baseUrl}/process`,
          this.provider.getSandboxHeaders(),
          body,
        );
    } catch (e) {
      throw mapBlaxelErr(e);
    }

    const code = out.exitCode ?? 0;
    return {
      stdout: out.stdout ?? "",
      stderr: out.stderr ?? "",
      exitCode: code,
      durationMs: Date.now() - start,
    };
  }

  async startCommand(
    req: StartCommandRequest,
  ): Promise<{ pid: number; handleId: string }> {
    const body: Record<string, unknown> = {
      command: req.cmd,
      waitForCompletion: false,
    };
    if (req.cwd) body.workingDir = req.cwd;
    if (req.env && Object.keys(req.env).length > 0) body.env = req.env;

    let out: BlaxelProcessResponse;
    try {
      out = await this.provider
        .getHc()
        .do(
          "POST",
          `${this.baseUrl}/process`,
          this.provider.getSandboxHeaders(),
          body,
        );
    } catch (e) {
      throw mapBlaxelErr(e);
    }

    const handle = out.pid ?? "";
    const pid = parseInt(handle, 10);
    if (!handle || Number.isNaN(pid)) {
      throw new ProviderError("blaxel", "process start did not return pid");
    }
    return { pid, handleId: handle };
  }

  async waitForHandle(handleId: string): Promise<CommandResult> {
    const start = Date.now();
    const deadline = start + 3600_000;
    let last: BlaxelProcessResponse | undefined;

    while (Date.now() < deadline) {
      try {
        last = await this.provider
          .getHc()
          .do(
            "GET",
            `${this.baseUrl}/process/${encodeURIComponent(handleId)}`,
            this.provider.getSandboxHeaders(),
          );
      } catch (e) {
        throw mapBlaxelErr(e);
      }

      if (!last) continue;
      const st = (last.status || "").toLowerCase();
      if (
        st === "completed" ||
        st === "failed" ||
        st === "killed" ||
        st === "stopped"
      ) {
        const code = last.exitCode ?? (st === "completed" ? 0 : 1);
        return {
          stdout: last.stdout ?? "",
          stderr: last.stderr ?? "",
          exitCode: code,
          durationMs: Date.now() - start,
        };
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    throw new ProviderError(
      "blaxel",
      "waitForHandle: timeout waiting for process",
    );
  }

  async killProcess(pid: number): Promise<void> {
    try {
      await this.provider
        .getHc()
        .do(
          "DELETE",
          `${this.baseUrl}/process/${encodeURIComponent(String(pid))}/kill`,
          this.provider.getSandboxHeaders(),
        );
    } catch (e) {
      throw mapBlaxelErr(e);
    }
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    let rows: BlaxelProcessResponse[];
    try {
      rows =
        (await this.provider
          .getHc()
          .do(
            "GET",
            `${this.baseUrl}/process`,
            this.provider.getSandboxHeaders(),
          )) ?? [];
    } catch (e) {
      throw mapBlaxelErr(e);
    }
    if (!Array.isArray(rows)) return [];

    return rows.map((p) => ({
      pid: parseInt(p.pid ?? "0", 10),
      command: p.command ?? "",
    }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const u = this.fsUrl(path);
    try {
      const resp = await this.provider.getHc().doRaw("GET", u, {
        ...this.provider.getSandboxHeaders(),
        Accept: "application/octet-stream,*/*",
      });
      return resp.body;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) throw new NotFoundError();
      throw mapBlaxelErr(e);
    }
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    mode?: number,
    _user?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      content: latin1FromBytes(content),
    };
    if (mode !== undefined) {
      body.permissions = (mode & 0o777).toString(8).padStart(3, "0");
    }
    try {
      await this.provider
        .getHc()
        .do("PUT", this.fsUrl(path), this.provider.getSandboxHeaders(), body);
    } catch (e) {
      throw mapBlaxelErr(e);
    }
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    let dir: BlaxelDirectory;
    try {
      dir = await this.provider
        .getHc()
        .do("GET", this.fsUrl(path), this.provider.getSandboxHeaders());
    } catch (e) {
      throw mapBlaxelErr(e);
    }

    const out: FileInfo[] = [];
    for (const f of dir.files ?? []) {
      out.push({
        name: f.name,
        path: f.path,
        isDir: false,
        size: f.size ?? 0,
      });
    }
    for (const d of dir.subdirectories ?? []) {
      out.push({
        name: d.name,
        path: d.path,
        isDir: true,
        size: 0,
      });
    }
    return out;
  }

  async makeDir(path: string): Promise<void> {
    try {
      await this.provider
        .getHc()
        .do("PUT", this.fsUrl(path), this.provider.getSandboxHeaders(), {
          isDirectory: true,
        });
    } catch (e) {
      throw mapBlaxelErr(e);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await this.provider
        .getHc()
        .do(
          "DELETE",
          `${this.fsUrl(path)}?recursive=true`,
          this.provider.getSandboxHeaders(),
        );
    } catch (e) {
      throw mapBlaxelErr(e);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.provider
        .getHc()
        .doRaw("GET", this.fsUrl(path), this.provider.getSandboxHeaders());
      return true;
    } catch (e) {
      if (e instanceof HTTPError && e.status === 404) return false;
      throw mapBlaxelErr(e);
    }
  }

  async createPty(_req: CreatePTYRequest): Promise<PTYInfo> {
    throw new NotSupportedError("blaxel: PTY not exposed in sandbox API");
  }

  async resizePty(_pid: number, _rows: number, _cols: number): Promise<void> {
    throw new NotSupportedError("blaxel: PTY not exposed in sandbox API");
  }

  async killPty(_pid: number): Promise<void> {
    throw new NotSupportedError("blaxel: PTY not exposed in sandbox API");
  }

  async listPty(): Promise<PTYInfo[]> {
    throw new NotSupportedError("blaxel: PTY not exposed in sandbox API");
  }
}

function stripNameLabels(m: Record<string, string>): Record<string, string> {
  const { name: _n, sandboxName: _s, createIfNotExist: _c, ...rest } = m;
  return rest;
}

function normalizeBaseUrl(url: string | undefined): string {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

function encodeFsPath(p: string): string {
  const norm = p.replace(/^\/+/, "");
  if (!norm) return "";
  return norm.split("/").map(encodeURIComponent).join("/");
}

function latin1FromBytes(buf: Uint8Array): string {
  if (buf.length < 65536) {
    let s = "";
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
  const chunks: string[] = [];
  const step = 65536;
  for (let i = 0; i < buf.length; i += step) {
    const slice = buf.subarray(i, i + step);
    let s = "";
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    chunks.push(s);
  }
  return chunks.join("");
}

function mapBlaxelDeploymentStatus(s?: string): SandboxStatus {
  switch ((s || "").toUpperCase()) {
    case "DEPLOYED":
      return "running";
    case "DEPLOYING":
    case "BUILDING":
    case "UPLOADING":
      return "starting";
    case "DEACTIVATED":
    case "TERMINATED":
    case "DELETING":
    case "DEACTIVATING":
      return "stopped";
    case "FAILED":
      return "error";
    default:
      return "running";
  }
}

function sandboxRowToInfo(row: BlaxelSandboxRow, id: string): SandboxInfo {
  const mem = row.spec?.runtime?.memory;
  const info: SandboxInfo = {
    id,
    provider: "blaxel",
    status: mapBlaxelDeploymentStatus(row.status),
    startedAt: row.metadata?.createdAt || new Date().toISOString(),
    metadata: row.metadata?.labels,
  };
  if (row.spec?.runtime?.image) info.template = row.spec.runtime.image;
  if (mem && mem > 0) {
    info.memoryMb = mem;
    info.cpus = Math.round(mem / 2048);
  }
  return info;
}

function mapBlaxelErr(e: unknown): Error {
  if (e instanceof HTTPError) {
    if (e.status === 404) return new NotFoundError();
    let msg = new TextDecoder().decode(e.body);
    try {
      const j = JSON.parse(msg) as { message?: string; error?: string };
      if (j.message) msg = j.message;
      else if (j.error) msg = j.error;
    } catch {
      /* keep raw */
    }
    return new ProviderError("blaxel", msg, e.status);
  }
  return e instanceof Error ? e : new Error(String(e));
}

registerProvider("blaxel", async (config: ProviderConfig) => {
  const tok = firstNonEmpty(
    config.apiKey,
    process.env.BLAXEL_API_KEY,
    process.env.BL_API_KEY,
    process.env.SANDBOXER_API_KEY,
  );
  if (!tok) {
    throw new ProviderError(
      "blaxel",
      "Blaxel API key required (config.apiKey, BLAXEL_API_KEY, BL_API_KEY, or SANDBOXER_API_KEY)",
    );
  }

  const workspace = firstNonEmpty(
    typeof config.workspace === "string" ? config.workspace : "",
    process.env.BLAXEL_WORKSPACE,
    process.env.BL_WORKSPACE,
  );

  const controlBase = (
    config.baseUrl ||
    process.env.BLAXEL_API_BASE ||
    DEFAULT_CONTROL_PLANE
  ).replace(/\/+$/, "");

  const hc = new HttpClient(config.defaultTimeoutMs);
  return new BlaxelProvider(hc, tok, controlBase, workspace);
});
