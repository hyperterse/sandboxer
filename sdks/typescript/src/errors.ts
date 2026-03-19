import type { ProviderName } from "./types.js";

export class SandboxerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxerError";
  }
}

export class NotFoundError extends SandboxerError {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends SandboxerError {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class RateLimitError extends SandboxerError {
  constructor(message = "rate limited") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class QuotaExceededError extends SandboxerError {
  constructor(message = "quota exceeded") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class NotSupportedError extends SandboxerError {
  constructor(message = "not supported") {
    super(message);
    this.name = "NotSupportedError";
  }
}

export class BadConfigError extends SandboxerError {
  constructor(message = "bad configuration") {
    super(message);
    this.name = "BadConfigError";
  }
}

export class ProviderError extends SandboxerError {
  provider: ProviderName;
  statusCode?: number;
  code?: string;

  constructor(
    provider: ProviderName,
    message: string,
    statusCode?: number,
    code?: string,
  ) {
    super(`provider ${provider}: ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.code = code;
  }
}
