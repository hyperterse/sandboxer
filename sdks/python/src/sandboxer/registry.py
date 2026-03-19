from __future__ import annotations

from typing import Callable

from .types import ProviderName
from .config import ProviderConfig
from .provider import Provider, AsyncProvider
from .errors import BadConfigError

_sync_factories: dict[ProviderName, Callable[[ProviderConfig], Provider]] = {}
_async_factories: dict[ProviderName, Callable[[ProviderConfig], AsyncProvider]] = {}


def register_provider(
    name: ProviderName,
    sync_factory: Callable[[ProviderConfig], Provider],
    async_factory: Callable[[ProviderConfig], AsyncProvider] | None = None,
) -> None:
    _sync_factories[name] = sync_factory
    if async_factory:
        _async_factories[name] = async_factory


def resolve_provider(name: ProviderName, config: ProviderConfig | None = None) -> Provider:
    factory = _sync_factories.get(name)
    if not factory:
        raise BadConfigError(f'unknown provider "{name}"')
    return factory(config or ProviderConfig())


def resolve_async_provider(name: ProviderName, config: ProviderConfig | None = None) -> AsyncProvider:
    factory = _async_factories.get(name)
    if not factory:
        raise BadConfigError(f'unknown async provider "{name}"')
    return factory(config or ProviderConfig())
