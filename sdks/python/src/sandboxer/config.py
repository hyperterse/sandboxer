from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProviderConfig:
    api_key: str | None = None
    base_url: str | None = None
    default_timeout_ms: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)
