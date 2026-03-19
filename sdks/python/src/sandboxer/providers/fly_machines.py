from __future__ import annotations

import os
import time
from datetime import datetime
from urllib.parse import quote

from ..types import (
    ProviderName,
    SandboxStatus,
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
from ..config import ProviderConfig
from ..provider import Provider, Sandbox
from ..errors import NotFoundError, NotSupportedError, ProviderError, BadConfigError
from .._http_client import HttpClient, HTTPError
from .._util import first_non_empty
from ..registry import register_provider

_DEFAULT_API = "https://api.machines.dev"


def _map_err(err: HTTPError) -> Exception:
    if err.status == 404:
        return NotFoundError(str(err))
    msg = err.body.decode(errors="replace")
    if len(msg) > 400:
        msg = msg[:400] + "..."
    return ProviderError(provider="fly-machines", message=msg, status_code=err.status)


class FlyMachinesProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        tok = first_non_empty(cfg.api_key, os.environ.get("FLY_API_TOKEN"))
        if not tok:
            raise BadConfigError("Fly API token required (api_key or FLY_API_TOKEN)")
        app = os.environ.get("FLY_APP_NAME") or os.environ.get("SANDBOXER_FLY_APP") or ""
        if not app:
            raise BadConfigError("set FLY_APP_NAME or SANDBOXER_FLY_APP")
        timeout_s = 30.0
        if cfg.default_timeout_ms:
            timeout_s = cfg.default_timeout_ms / 1000.0
        self._hc = HttpClient(timeout_s=timeout_s)
        self._token = tok
        base = cfg.base_url or os.environ.get("FLY_API_HOSTNAME") or _DEFAULT_API
        self._base = base.rstrip("/")
        self._app = app

    def _hdr(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.FLY_MACHINES:
            return []
        url = f"{self._base}/v1/apps/{quote(self._app, safe='')}/machines"
        try:
            result = self._hc.do("GET", url, self._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        if not result:
            return []
        # API may return list directly or wrapped
        machines = result if isinstance(result, list) else result.get("machines", [])
        out: list[SandboxInfo] = []
        for m in machines:
            state = (m.get("state") or "running").lower()
            st = SandboxStatus.STOPPED if state in ("stopped", "destroyed") else SandboxStatus.RUNNING
            out.append(
                SandboxInfo(
                    id=m.get("id", ""),
                    provider=ProviderName.FLY_MACHINES,
                    status=st,
                    started_at=datetime.now(),
                    metadata={"region": m.get("region", ""), "app": self._app},
                )
            )
            if filter.limit and filter.limit > 0 and len(out) >= filter.limit:
                break
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        url = f"{self._base}/v1/apps/{quote(self._app, safe='')}/machines/{quote(sandbox_id, safe='')}?force=true"
        try:
            self._hc.do("DELETE", url, self._hdr())
        except HTTPError as e:
            raise _map_err(e) from e

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        image = req.template or "nginx:alpine"
        cpus = req.cpus or 1
        mem = req.memory_mb or 256
        body = {
            "config": {
                "image": image,
                "guest": {
                    "cpu_kind": "shared",
                    "cpus": cpus,
                    "memory_mb": mem,
                },
                "auto_destroy": True,
                "auto_start_machines": True,
                "restart": {"policy": "no"},
                "stop_timeout": "60s",
                "env": req.envs,
                "metadata": req.metadata,
            },
            "region": first_non_empty(os.environ.get("FLY_REGION"), "iad"),
        }
        url = f"{self._base}/v1/apps/{quote(self._app, safe='')}/machines"
        try:
            created = self._hc.do("POST", url, self._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        cid = created.get("id", "")  # type: ignore[union-attr]
        sb = FlyMachinesSandbox(provider=self, sandbox_id=cid)
        info = SandboxInfo(
            id=cid,
            provider=ProviderName.FLY_MACHINES,
            status=SandboxStatus.STARTING,
            started_at=datetime.now(),
            template=image,
            metadata={"app": self._app},
            cpus=cpus,
            memory_mb=mem,
        )
        return sb, info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        sb = FlyMachinesSandbox(provider=self, sandbox_id=sandbox_id)
        sb.info()  # validate
        return sb

    def close(self) -> None:
        self._hc.close()


class FlyMachinesSandbox(Sandbox):
    def __init__(self, provider: FlyMachinesProvider, sandbox_id: str) -> None:
        self._p = provider
        self._id = sandbox_id

    @property
    def id(self) -> str:
        return self._id

    def info(self) -> SandboxInfo:
        url = f"{self._p._base}/v1/apps/{quote(self._p._app, safe='')}/machines/{quote(self._id, safe='')}"
        try:
            m = self._p._hc.do("GET", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        state = (m.get("state") or "running").lower()  # type: ignore[union-attr]
        st = SandboxStatus.STOPPED if state == "stopped" else SandboxStatus.RUNNING
        config = m.get("config", {}) if isinstance(m, dict) else {}  # type: ignore[union-attr]
        guest = config.get("guest", {})
        image = config.get("image") or None
        cpus = guest.get("cpus") or None
        memory = guest.get("memory_mb") or None
        return SandboxInfo(
            id=m.get("id", ""),  # type: ignore[union-attr]
            provider=ProviderName.FLY_MACHINES,
            status=st,
            started_at=datetime.now(),
            template=image,
            metadata={"app": self._p._app},
            cpus=cpus if cpus and cpus > 0 else None,
            memory_mb=memory if memory and memory > 0 else None,
        )

    def is_running(self) -> bool:
        return self.info().status == SandboxStatus.RUNNING

    def pause(self) -> None:
        url = f"{self._p._base}/v1/apps/{quote(self._p._app, safe='')}/machines/{quote(self._id, safe='')}/suspend"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def resume(self) -> None:
        url = f"{self._p._base}/v1/apps/{quote(self._p._app, safe='')}/machines/{quote(self._id, safe='')}/start"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def kill(self) -> None:
        self._p.kill_sandbox(self._id)

    def port_url(self, port: int) -> str:
        raise NotSupportedError("Fly Machines does not support port_url")

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        raise NotSupportedError("Fly Machines does not support run_command")

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        raise NotSupportedError("Fly Machines does not support start_command")

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        raise NotSupportedError("Fly Machines does not support wait_for_handle")

    def kill_process(self, pid: int) -> None:
        raise NotSupportedError("Fly Machines does not support kill_process")

    def list_processes(self) -> list[ProcessInfo]:
        raise NotSupportedError("Fly Machines does not support list_processes")

    def read_file(self, path: str) -> bytes:
        raise NotSupportedError("Fly Machines does not support read_file")

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        raise NotSupportedError("Fly Machines does not support write_file")

    def list_directory(self, path: str) -> list[FileInfo]:
        raise NotSupportedError("Fly Machines does not support list_directory")

    def make_dir(self, path: str) -> None:
        raise NotSupportedError("Fly Machines does not support make_dir")

    def remove(self, path: str) -> None:
        raise NotSupportedError("Fly Machines does not support remove")

    def exists(self, path: str) -> bool:
        raise NotSupportedError("Fly Machines does not support exists")

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("Fly Machines does not support create_pty")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("Fly Machines does not support resize_pty")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("Fly Machines does not support kill_pty")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("Fly Machines does not support list_pty")


def _make_fly_provider(cfg: ProviderConfig) -> Provider:
    return FlyMachinesProvider(cfg)


register_provider(ProviderName.FLY_MACHINES, _make_fly_provider)
