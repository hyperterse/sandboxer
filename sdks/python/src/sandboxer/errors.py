from __future__ import annotations


class SandboxerError(Exception):
    pass


class NotFoundError(SandboxerError):
    pass


class UnauthorizedError(SandboxerError):
    pass


class RateLimitError(SandboxerError):
    pass


class QuotaExceededError(SandboxerError):
    pass


class NotSupportedError(SandboxerError):
    pass


class BadConfigError(SandboxerError):
    pass


class ProviderError(SandboxerError):
    def __init__(
        self,
        provider: str,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
    ):
        super().__init__(f"provider {provider}: {message}")
        self.provider = provider
        self.status_code = status_code
        self.code = code
