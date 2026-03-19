from __future__ import annotations

from abc import ABC, abstractmethod

from .types import (
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
)


class Sandbox(ABC):
    @property
    @abstractmethod
    def id(self) -> str: ...

    @abstractmethod
    def info(self) -> SandboxInfo: ...

    @abstractmethod
    def is_running(self) -> bool: ...

    @abstractmethod
    def pause(self) -> None: ...

    @abstractmethod
    def resume(self) -> None: ...

    @abstractmethod
    def kill(self) -> None: ...

    @abstractmethod
    def port_url(self, port: int) -> str: ...

    @abstractmethod
    def run_command(self, req: RunCommandRequest) -> CommandResult: ...

    @abstractmethod
    def start_command(self, req: StartCommandRequest) -> tuple[int, str]: ...

    @abstractmethod
    def wait_for_handle(self, handle_id: str) -> CommandResult: ...

    @abstractmethod
    def kill_process(self, pid: int) -> None: ...

    @abstractmethod
    def list_processes(self) -> list[ProcessInfo]: ...

    @abstractmethod
    def read_file(self, path: str) -> bytes: ...

    @abstractmethod
    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None: ...

    @abstractmethod
    def list_directory(self, path: str) -> list[FileInfo]: ...

    @abstractmethod
    def make_dir(self, path: str) -> None: ...

    @abstractmethod
    def remove(self, path: str) -> None: ...

    @abstractmethod
    def exists(self, path: str) -> bool: ...

    @abstractmethod
    def create_pty(self, req: CreatePTYRequest) -> PTYInfo: ...

    @abstractmethod
    def resize_pty(self, pid: int, rows: int, cols: int) -> None: ...

    @abstractmethod
    def kill_pty(self, pid: int) -> None: ...

    @abstractmethod
    def list_pty(self) -> list[PTYInfo]: ...


class Provider(ABC):
    @abstractmethod
    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]: ...

    @abstractmethod
    def kill_sandbox(self, sandbox_id: str) -> None: ...

    @abstractmethod
    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]: ...

    @abstractmethod
    def attach_sandbox(self, sandbox_id: str) -> Sandbox: ...

    @abstractmethod
    def close(self) -> None: ...


class AsyncSandbox(ABC):
    @property
    @abstractmethod
    def id(self) -> str: ...

    @abstractmethod
    async def info(self) -> SandboxInfo: ...

    @abstractmethod
    async def is_running(self) -> bool: ...

    @abstractmethod
    async def pause(self) -> None: ...

    @abstractmethod
    async def resume(self) -> None: ...

    @abstractmethod
    async def kill(self) -> None: ...

    @abstractmethod
    async def port_url(self, port: int) -> str: ...

    @abstractmethod
    async def run_command(self, req: RunCommandRequest) -> CommandResult: ...

    @abstractmethod
    async def start_command(self, req: StartCommandRequest) -> tuple[int, str]: ...

    @abstractmethod
    async def wait_for_handle(self, handle_id: str) -> CommandResult: ...

    @abstractmethod
    async def kill_process(self, pid: int) -> None: ...

    @abstractmethod
    async def list_processes(self) -> list[ProcessInfo]: ...

    @abstractmethod
    async def read_file(self, path: str) -> bytes: ...

    @abstractmethod
    async def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None: ...

    @abstractmethod
    async def list_directory(self, path: str) -> list[FileInfo]: ...

    @abstractmethod
    async def make_dir(self, path: str) -> None: ...

    @abstractmethod
    async def remove(self, path: str) -> None: ...

    @abstractmethod
    async def exists(self, path: str) -> bool: ...

    @abstractmethod
    async def create_pty(self, req: CreatePTYRequest) -> PTYInfo: ...

    @abstractmethod
    async def resize_pty(self, pid: int, rows: int, cols: int) -> None: ...

    @abstractmethod
    async def kill_pty(self, pid: int) -> None: ...

    @abstractmethod
    async def list_pty(self) -> list[PTYInfo]: ...


class AsyncProvider(ABC):
    @abstractmethod
    async def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]: ...

    @abstractmethod
    async def kill_sandbox(self, sandbox_id: str) -> None: ...

    @abstractmethod
    async def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[AsyncSandbox, SandboxInfo]: ...

    @abstractmethod
    async def attach_sandbox(self, sandbox_id: str) -> AsyncSandbox: ...

    @abstractmethod
    async def close(self) -> None: ...
