export type ProviderName =
  | "e2b"
  | "daytona"
  | "blaxel"
  | "runloop"
  | "fly-machines"
  | "local";

export type SandboxStatus =
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "error";

export interface SandboxInfo {
  id: string;
  provider: ProviderName;
  template?: string;
  status: SandboxStatus;
  startedAt: string; // ISO 8601
  expiresAt?: string;
  metadata?: Record<string, string>;
  cpus?: number;
  memoryMb?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode?: number;
}

export interface ProcessInfo {
  pid: number;
  command: string;
  user?: string;
}

export interface PTYInfo {
  pid: number;
  rows: number;
  cols: number;
}

export type WatchEventType = "create" | "modify" | "delete" | "rename";

export interface WatchEvent {
  path: string;
  eventType: WatchEventType;
}

export interface CreateSandboxRequest {
  provider?: ProviderName;
  template?: string;
  timeoutSeconds?: number;
  metadata?: Record<string, string>;
  envs?: Record<string, string>;
  cpus?: number;
  memoryMb?: number;
  autoDestroy?: boolean;
}

export interface RunCommandRequest {
  cmd: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutSeconds?: number;
  user?: string;
}

export interface StartCommandRequest {
  cmd: string;
  cwd?: string;
  env?: Record<string, string>;
  user?: string;
}

export interface CreatePTYRequest {
  rows?: number;
  cols?: number;
  cwd?: string;
  env?: Record<string, string>;
  user?: string;
  command?: string;
}

export interface ListSandboxesFilter {
  provider?: ProviderName;
  metadataFilter?: string;
  limit?: number;
}
