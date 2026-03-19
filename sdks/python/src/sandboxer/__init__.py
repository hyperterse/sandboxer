from __future__ import annotations

from typing import Any

from .types import *  # noqa: F403
from .errors import *  # noqa: F403
from .provider import Provider, Sandbox, AsyncProvider, AsyncSandbox
from .config import ProviderConfig
from .registry import resolve_provider, resolve_async_provider, register_provider
from ._version import VERSION

# Trigger provider registrations
from . import providers as _providers  # noqa: F401

from .types import (
    ProviderName,
    SandboxInfo,
    CreateSandboxRequest,
    ListSandboxesFilter,
)


class Sandboxer:
    """Main entry point for sync usage."""

    def __init__(self, provider: str, config: dict[str, Any] | ProviderConfig | None = None):
        if isinstance(config, dict):
            config = ProviderConfig(
                api_key=config.get("api_key") or config.get("apiKey"),
                base_url=config.get("base_url") or config.get("baseUrl"),
                default_timeout_ms=config.get("default_timeout_ms") or config.get("defaultTimeoutMs"),
                extra={
                    k: v
                    for k, v in config.items()
                    if k not in ("api_key", "apiKey", "base_url", "baseUrl", "default_timeout_ms", "defaultTimeoutMs")
                },
            )
        name = ProviderName(provider)
        self._provider = resolve_provider(name, config)

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        return self._provider.create_sandbox(req)

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        return self._provider.list_sandboxes(filter)

    def kill_sandbox(self, sandbox_id: str) -> None:
        return self._provider.kill_sandbox(sandbox_id)

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        return self._provider.attach_sandbox(sandbox_id)

    def close(self) -> None:
        return self._provider.close()


class AsyncSandboxer:
    """Main entry point for async usage."""

    def __init__(self, provider: str, config: dict[str, Any] | ProviderConfig | None = None):
        if isinstance(config, dict):
            config = ProviderConfig(
                api_key=config.get("api_key") or config.get("apiKey"),
                base_url=config.get("base_url") or config.get("baseUrl"),
                default_timeout_ms=config.get("default_timeout_ms") or config.get("defaultTimeoutMs"),
                extra={
                    k: v
                    for k, v in config.items()
                    if k not in ("api_key", "apiKey", "base_url", "baseUrl", "default_timeout_ms", "defaultTimeoutMs")
                },
            )
        name = ProviderName(provider)
        self._provider = resolve_async_provider(name, config)

    async def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[AsyncSandbox, SandboxInfo]:
        return await self._provider.create_sandbox(req)

    async def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        return await self._provider.list_sandboxes(filter)

    async def kill_sandbox(self, sandbox_id: str) -> None:
        return await self._provider.kill_sandbox(sandbox_id)

    async def attach_sandbox(self, sandbox_id: str) -> AsyncSandbox:
        return await self._provider.attach_sandbox(sandbox_id)

    async def close(self) -> None:
        return await self._provider.close()


__all__ = [
    "Sandboxer",
    "AsyncSandboxer",
    "Provider",
    "Sandbox",
    "AsyncProvider",
    "AsyncSandbox",
    "ProviderConfig",
    "ProviderName",
    "SandboxStatus",
    "SandboxInfo",
    "CommandResult",
    "FileInfo",
    "ProcessInfo",
    "PTYInfo",
    "WatchEventType",
    "WatchEvent",
    "CreateSandboxRequest",
    "RunCommandRequest",
    "StartCommandRequest",
    "CreatePTYRequest",
    "ListSandboxesFilter",
    "SandboxerError",
    "NotFoundError",
    "UnauthorizedError",
    "RateLimitError",
    "QuotaExceededError",
    "NotSupportedError",
    "BadConfigError",
    "ProviderError",
    "register_provider",
    "VERSION",
]
