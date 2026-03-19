from __future__ import annotations

from enum import StrEnum
from datetime import datetime

from pydantic import BaseModel, Field


class ProviderName(StrEnum):
    E2B = "e2b"
    DAYTONA = "daytona"
    BLAXEL = "blaxel"
    RUNLOOP = "runloop"
    FLY_MACHINES = "fly-machines"
    LOCAL = "local"


class SandboxStatus(StrEnum):
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class SandboxInfo(BaseModel):
    id: str
    provider: ProviderName
    template: str | None = None
    status: SandboxStatus
    started_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    cpus: int | None = None
    memory_mb: int | None = None


class CommandResult(BaseModel):
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    duration_ms: int = 0
    error: str | None = None


class FileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool = False
    size: int = 0
    mode: int | None = None


class ProcessInfo(BaseModel):
    pid: int
    command: str
    user: str | None = None


class PTYInfo(BaseModel):
    pid: int
    rows: int
    cols: int


class WatchEventType(StrEnum):
    CREATE = "create"
    MODIFY = "modify"
    DELETE = "delete"
    RENAME = "rename"


class WatchEvent(BaseModel):
    path: str
    event_type: WatchEventType


class CreateSandboxRequest(BaseModel):
    provider: ProviderName | None = None
    template: str | None = None
    timeout_seconds: int | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    envs: dict[str, str] = Field(default_factory=dict)
    cpus: int | None = None
    memory_mb: int | None = None
    auto_destroy: bool | None = None


class RunCommandRequest(BaseModel):
    cmd: str
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: int | None = None
    user: str | None = None


class StartCommandRequest(BaseModel):
    cmd: str
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    user: str | None = None


class CreatePTYRequest(BaseModel):
    rows: int | None = None
    cols: int | None = None
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    user: str | None = None
    command: str | None = None


class ListSandboxesFilter(BaseModel):
    provider: ProviderName | None = None
    metadata_filter: str | None = None
    limit: int | None = None
