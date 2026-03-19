import type { ProviderName } from "./types.js";

export interface SandboxerConfig {
  provider: ProviderName;
  config?: ProviderConfig;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  [key: string]: unknown; // provider-specific config
}
