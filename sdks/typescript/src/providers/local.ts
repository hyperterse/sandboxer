import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
import {
  BadConfigError,
  NotFoundError,
  NotSupportedError,
  ProviderError,
} from "../errors.js";
import { normalizePath } from "../util.js";

const execFileAsync = promisify(execFile);

const LABEL_MANAGED = "sandboxer.managed";
const LABEL_PROVIDER = "sandboxer.provider";

async function dockerExec(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", args);
    return stdout;
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || String(e);
    throw new ProviderError("local", `docker ${args[0]}: ${msg.trim()}`);
  }
}

async function dockerOK(): Promise<void> {
  try {
    await execFileAsync("docker", ["info"]);
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new BadConfigError(
      `docker info: ${(err.stderr || err.message || "").trim()}`,
    );
  }
}

function sanitizeLabelKey(k: string): string {
  const out = k.replace(/[^a-zA-Z0-9._-]/g, "_");
  return out || "key";
}

class LocalProvider implements Provider {
  async listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]> {
    if (filter?.provider && filter.provider !== "local") return [];
    const raw = await dockerExec(
      "ps",
      "-a",
      "-q",
      "--no-trunc",
      "--filter",
      `label=${LABEL_MANAGED}=true`,
    );
    const ids = raw.trim().split(/\s+/).filter(Boolean);
    const out: SandboxInfo[] = [];
    for (const id of ids) {
      try {
        const info = await this.inspect(id);
        if (
          filter?.metadataFilter &&
          !metadataContains(info.metadata, filter.metadataFilter)
        )
          continue;
        out.push(info);
        if (filter?.limit && filter.limit > 0 && out.length >= filter.limit)
          break;
      } catch {
        continue;
      }
    }
    return out;
  }

  async killSandbox(sandboxId: string): Promise<void> {
    await dockerExec("rm", "-f", sandboxId);
  }

  async createSandbox(
    req?: CreateSandboxRequest,
  ): Promise<[Sandbox, SandboxInfo]> {
    const image = req?.template || "alpine:latest";
    const args = [
      "create",
      "--label",
      `${LABEL_MANAGED}=true`,
      "--label",
      `${LABEL_PROVIDER}=local`,
    ];
    if (req?.metadata) {
      for (const [k, v] of Object.entries(req.metadata)) {
        args.push("--label", `sandboxer.meta.${sanitizeLabelKey(k)}=${v}`);
      }
    }
    if (req?.envs) {
      for (const [k, v] of Object.entries(req.envs)) {
        args.push("-e", `${k}=${v}`);
      }
    }
    if (req?.cpus && req.cpus > 0) args.push("--cpus", String(req.cpus));
    if (req?.memoryMb && req.memoryMb > 0) args.push("-m", `${req.memoryMb}m`);
    args.push(image, "sleep", "infinity");

    const createOut = await dockerExec(...args);
    const id = createOut.trim();
    try {
      await dockerExec("start", id);
    } catch {
      try {
        await dockerExec("rm", "-f", id);
      } catch {
        /* ignore */
      }
      throw new ProviderError("local", "failed to start container");
    }

    const info = await this.inspect(id);
    return [new LocalSandbox(id), info];
  }

  async attachSandbox(sandboxId: string): Promise<Sandbox> {
    const info = await this.inspect(sandboxId);
    if (info.status !== "running") throw new NotFoundError();
    return new LocalSandbox(sandboxId);
  }

  async close(): Promise<void> {}

  async inspect(id: string): Promise<SandboxInfo> {
    let raw: string;
    try {
      raw = await dockerExec("inspect", id);
    } catch (e) {
      if (String(e).includes("No such object")) throw new NotFoundError();
      throw e;
    }

    const wrap = JSON.parse(raw);
    if (!Array.isArray(wrap) || wrap.length === 0) throw new NotFoundError();
    const c = wrap[0];
    if (c.Config?.Labels?.[LABEL_MANAGED] !== "true") throw new NotFoundError();

    let status: SandboxStatus = "stopped";
    if (c.State?.Running) status = "running";
    else if (c.State?.Paused) status = "paused";
    else if (c.State?.Status === "created" || c.State?.Status === "restarting")
      status = "starting";
    else if (
      c.State?.OOMKilled ||
      (c.State?.ExitCode && c.State.ExitCode !== 0)
    )
      status = "error";

    const meta: Record<string, string> = {};
    const labels = c.Config?.Labels || {};
    for (const [k, v] of Object.entries(labels)) {
      if (k.startsWith("sandboxer.meta.")) {
        meta[k.slice("sandboxer.meta.".length)] = v as string;
      }
    }

    let startedAt = new Date().toISOString();
    if (c.State?.StartedAt) {
      try {
        startedAt = new Date(c.State.StartedAt).toISOString();
      } catch {
        /* keep default */
      }
    }

    const info: SandboxInfo = {
      id: c.Id,
      provider: "local",
      template: c.Config?.Image,
      status,
      startedAt,
      metadata: meta,
    };
    return info;
  }
}

class LocalSandbox implements Sandbox {
  readonly id: string;
  private pidSeq = 0;
  private handles = new Map<
    string,
    Promise<{ res: CommandResult; err?: Error }>
  >();

  constructor(id: string) {
    this.id = id.trim();
  }

  async info(): Promise<SandboxInfo> {
    const p = new LocalProvider();
    return p.inspect(this.id);
  }

  async isRunning(): Promise<boolean> {
    const i = await this.info();
    return i.status === "running";
  }

  async pause(): Promise<void> {
    await dockerExec("pause", this.id);
  }

  async resume(): Promise<void> {
    await dockerExec("unpause", this.id);
  }

  async kill(): Promise<void> {
    await dockerExec("rm", "-f", this.id);
  }

  async portUrl(port: number): Promise<string> {
    const raw = await dockerExec("inspect", this.id);
    const wrap = JSON.parse(raw);
    if (!Array.isArray(wrap) || wrap.length === 0) throw new NotFoundError();
    const ports = wrap[0]?.NetworkSettings?.Ports;
    const key = `${port}/tcp`;
    const binds = ports?.[key];
    if (!binds || binds.length === 0) throw new NotSupportedError();
    let hostIP = binds[0].HostIp || "127.0.0.1";
    if (hostIP === "0.0.0.0") hostIP = "127.0.0.1";
    return `http://${hostIP}:${binds[0].HostPort}`;
  }

  async runCommand(req: RunCommandRequest): Promise<CommandResult> {
    const start = Date.now();
    const args = ["exec", "-i"];
    if (req.user) args.push("-u", req.user);
    if (req.cwd) args.push("-w", req.cwd);
    args.push(this.id, "/bin/sh", "-c", req.cmd);

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const opts: { timeout?: number } = {};
      if (req.timeoutSeconds && req.timeoutSeconds > 0)
        opts.timeout = req.timeoutSeconds * 1000;
      const result = await execFileAsync("docker", args, opts);
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (e: unknown) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      if (typeof err.code === "number") {
        exitCode = err.code;
        stdout = err.stdout || "";
        stderr = err.stderr || "";
      } else {
        throw mapDockerErr(e);
      }
    }

    return {
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - start,
    };
  }

  async startCommand(
    req: StartCommandRequest,
  ): Promise<{ pid: number; handleId: string }> {
    const n = ++this.pidSeq;
    const handleId = `h${Date.now()}-${n}`;

    const promise = (async (): Promise<{ res: CommandResult; err?: Error }> => {
      try {
        const res = await this.runCommand({
          cmd: req.cmd,
          cwd: req.cwd,
          env: req.env,
          user: req.user,
        });
        return { res };
      } catch (e) {
        return {
          res: { stdout: "", stderr: "", exitCode: -1, durationMs: 0 },
          err: e instanceof Error ? e : new Error(String(e)),
        };
      }
    })();

    this.handles.set(handleId, promise);
    return { pid: n, handleId };
  }

  async waitForHandle(handleId: string): Promise<CommandResult> {
    const promise = this.handles.get(handleId);
    if (!promise) throw new NotFoundError();
    this.handles.delete(handleId);
    const outcome = await promise;
    if (outcome.err) throw outcome.err;
    return outcome.res;
  }

  async killProcess(pid: number): Promise<void> {
    await this.runCommand({ cmd: `kill -9 ${pid} 2>/dev/null || true` });
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    const raw = await dockerExec("top", this.id, "-eo", "pid,args");
    const lines = raw.trim().split("\n");
    if (lines.length < 2) return [];
    const out: ProcessInfo[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].trim().split(/\s+/);
      if (fields.length < 2) continue;
      const pid = parseInt(fields[0], 10);
      if (isNaN(pid)) continue;
      out.push({ pid, command: fields.slice(1).join(" ") });
    }
    return out;
  }

  async readFile(path: string): Promise<Uint8Array> {
    path = normalizePath(path);
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["cp", `${this.id}:${path}`, "-"],
        {
          encoding: "buffer" as unknown as string,
          maxBuffer: 100 * 1024 * 1024,
        },
      );
      // stdout is a tar archive - extract first entry
      const buf =
        typeof stdout === "string"
          ? new TextEncoder().encode(stdout)
          : new Uint8Array(stdout as unknown as ArrayBuffer);
      return extractFirstTarEntry(buf);
    } catch (e: unknown) {
      const err = e as { stderr?: string | Buffer };
      const stderrStr = err.stderr ? String(err.stderr) : "";
      if (stderrStr.includes("Could not find the file"))
        throw new NotFoundError();
      throw mapDockerErr(e);
    }
  }

  async writeFile(
    path: string,
    content: Uint8Array,
    mode?: number,
    _user?: string,
  ): Promise<void> {
    path = normalizePath(path);
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash > 0 ? path.slice(0, lastSlash) : "/";
    const base = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

    const fileMode = mode ?? 0o644;
    const tar = createTarArchive(base, content, fileMode);

    return new Promise<void>((resolve, reject) => {
      const child = execFile(
        "docker",
        ["cp", "-", `${this.id}:${dir}`],
        (err) => {
          if (err) reject(mapDockerErr(err));
          else resolve();
        },
      );
      child.stdin?.end(Buffer.from(tar));
    });
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    path = normalizePath(path);
    const res = await this.runCommand({ cmd: `ls -1b "${path}"` });
    if (res.exitCode !== 0) throw new NotFoundError();
    const out: FileInfo[] = [];
    for (const name of res.stdout.trim().split("\n")) {
      const n = name.trim();
      if (!n) continue;
      out.push({ name: n, path: `${path}/${n}`, isDir: false, size: 0 });
    }
    return out;
  }

  async makeDir(path: string): Promise<void> {
    path = normalizePath(path);
    await this.runCommand({ cmd: `mkdir -p "${path}"` });
  }

  async remove(path: string): Promise<void> {
    path = normalizePath(path);
    await this.runCommand({ cmd: `rm -rf "${path}"` });
  }

  async exists(path: string): Promise<boolean> {
    path = normalizePath(path);
    const res = await this.runCommand({ cmd: `test -e "${path}" && echo ok` });
    return res.exitCode === 0 && res.stdout.includes("ok");
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

function metadataContains(
  m: Record<string, string> | undefined,
  needle: string,
): boolean {
  if (!needle || !m) return !needle;
  for (const v of Object.values(m)) {
    if (v.includes(needle)) return true;
  }
  return false;
}

function mapDockerErr(e: unknown): Error {
  const msg = String(e);
  if (msg.includes("No such container")) return new NotFoundError();
  return new ProviderError("local", msg);
}

/**
 * Minimal tar entry extraction: reads the first file from a tar archive.
 */
function extractFirstTarEntry(buf: Uint8Array): Uint8Array {
  if (buf.length < 512) throw new Error("invalid tar: too short");
  // File size is at offset 124, 12 bytes, octal, null-terminated
  let sizeStr = "";
  for (let i = 124; i < 136; i++) {
    if (buf[i] === 0) break;
    sizeStr += String.fromCharCode(buf[i]);
  }
  const size = parseInt(sizeStr.trim(), 8);
  if (isNaN(size) || size < 0) throw new Error("invalid tar header");
  // Data starts at offset 512
  return buf.slice(512, 512 + size);
}

/**
 * Creates a minimal tar archive with a single file entry.
 */
function createTarArchive(
  name: string,
  content: Uint8Array,
  mode: number,
): Uint8Array {
  const header = new Uint8Array(512);
  const encoder = new TextEncoder();

  // name (offset 0, 100 bytes)
  const nameBytes = encoder.encode(name);
  header.set(nameBytes.slice(0, 100), 0);

  // mode (offset 100, 8 bytes) - octal, null-terminated
  const modeStr = mode.toString(8).padStart(7, "0") + "\0";
  header.set(encoder.encode(modeStr), 100);

  // uid (offset 108, 8 bytes)
  header.set(encoder.encode("0000000\0"), 108);
  // gid (offset 116, 8 bytes)
  header.set(encoder.encode("0000000\0"), 116);

  // size (offset 124, 12 bytes) - octal, null-terminated
  const sizeStr = content.length.toString(8).padStart(11, "0") + "\0";
  header.set(encoder.encode(sizeStr), 124);

  // mtime (offset 136, 12 bytes)
  const mtime =
    Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, "0") + "\0";
  header.set(encoder.encode(mtime), 136);

  // typeflag (offset 156, 1 byte) - '0' for regular file
  header[156] = 48; // ASCII '0'

  // Compute checksum (offset 148, 8 bytes)
  // Initialize checksum field with spaces first
  for (let i = 148; i < 156; i++) header[i] = 32; // space
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  const csStr = checksum.toString(8).padStart(6, "0") + "\0 ";
  header.set(encoder.encode(csStr), 148);

  // Pad content to 512-byte boundary
  const paddedSize = Math.ceil(content.length / 512) * 512;
  const dataBlock = new Uint8Array(paddedSize);
  dataBlock.set(content, 0);

  // End of archive: two 512-byte zero blocks
  const endBlocks = new Uint8Array(1024);

  const result = new Uint8Array(512 + paddedSize + 1024);
  result.set(header, 0);
  result.set(dataBlock, 512);
  result.set(endBlocks, 512 + paddedSize);
  return result;
}

registerProvider("local", async (_config: ProviderConfig) => {
  await dockerOK();
  return new LocalProvider();
});
