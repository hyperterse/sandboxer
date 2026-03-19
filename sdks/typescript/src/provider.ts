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
} from "./types.js";

export interface Provider {
  listSandboxes(filter?: ListSandboxesFilter): Promise<SandboxInfo[]>;
  killSandbox(sandboxId: string): Promise<void>;
  createSandbox(req?: CreateSandboxRequest): Promise<[Sandbox, SandboxInfo]>;
  attachSandbox(sandboxId: string): Promise<Sandbox>;
  close(): Promise<void>;
}

export interface Sandbox {
  readonly id: string;
  info(): Promise<SandboxInfo>;
  isRunning(): Promise<boolean>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  kill(): Promise<void>;
  portUrl(port: number): Promise<string>;
  runCommand(req: RunCommandRequest): Promise<CommandResult>;
  startCommand(
    req: StartCommandRequest,
  ): Promise<{ pid: number; handleId: string }>;
  waitForHandle(handleId: string): Promise<CommandResult>;
  killProcess(pid: number): Promise<void>;
  listProcesses(): Promise<ProcessInfo[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(
    path: string,
    content: Uint8Array,
    mode?: number,
    user?: string,
  ): Promise<void>;
  listDirectory(path: string): Promise<FileInfo[]>;
  makeDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  createPty(req: CreatePTYRequest): Promise<PTYInfo>;
  resizePty(pid: number, rows: number, cols: number): Promise<void>;
  killPty(pid: number): Promise<void>;
  listPty(): Promise<PTYInfo[]>;
}
