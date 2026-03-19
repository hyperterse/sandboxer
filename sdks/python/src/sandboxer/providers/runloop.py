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
from .._util import first_non_empty, shell_quote
from ..registry import register_provider

_DEFAULT_API = "https://api.runloop.ai"


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def _map_err(err: HTTPError) -> Exception:
    if err.status == 404:
        return NotFoundError(str(err))
    msg = err.body.decode(errors="replace")
    if len(msg) > 512:
        msg = msg[:512] + "..."
    return ProviderError(provider="runloop", message=msg, status_code=err.status)


def _map_status(s: str) -> SandboxStatus:
    low = s.lower()
    if low in ("suspended", "suspending"):
        return SandboxStatus.PAUSED
    if low in ("shutdown", "failure"):
        return SandboxStatus.STOPPED
    if low in ("provisioning", "initializing", "resuming"):
        return SandboxStatus.STARTING
    return SandboxStatus.RUNNING


class RunloopProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        tok = first_non_empty(cfg.api_key, os.environ.get("RUNLOOP_API_KEY"))
        if not tok:
            raise BadConfigError("Runloop API key required (api_key or RUNLOOP_API_KEY)")
        timeout_s = 30.0
        if cfg.default_timeout_ms:
            timeout_s = cfg.default_timeout_ms / 1000.0
        self._hc = HttpClient(timeout_s=timeout_s)
        self._token = tok
        self._base = (cfg.base_url or _DEFAULT_API).rstrip("/")

    def _hdr(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.RUNLOOP:
            return []
        url = f"{self._base}/v1/devboxes?limit=5000"
        try:
            page = self._hc.do("GET", url, self._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        if not page:
            return []
        devboxes = page.get("devboxes", []) if isinstance(page, dict) else []  # type: ignore[union-attr]
        out: list[SandboxInfo] = []
        for d in devboxes:
            name = d.get("name") or None
            out.append(
                SandboxInfo(
                    id=d.get("id", ""),
                    provider=ProviderName.RUNLOOP,
                    status=_map_status(d.get("status", "running")),
                    started_at=datetime.now(),
                    template=name,
                )
            )
            if filter.limit and filter.limit > 0 and len(out) >= filter.limit:
                break
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        url = f"{self._base}/v1/devboxes/{quote(sandbox_id, safe='')}/shutdown"
        try:
            self._hc.do("POST", url, self._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        body: dict = {}
        if req.template:
            body["blueprint_name"] = req.template
        if req.envs:
            body["environment_variables"] = req.envs
        if req.metadata:
            body["metadata"] = req.metadata
        url = f"{self._base}/v1/devboxes"
        try:
            created = self._hc.do("POST", url, self._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        cid = created.get("id", "")  # type: ignore[union-attr]
        name = created.get("name") or (req.template if req.template else None)  # type: ignore[union-attr]
        sb = RunloopSandbox(provider=self, sandbox_id=cid)
        info = SandboxInfo(
            id=cid,
            provider=ProviderName.RUNLOOP,
            status=_map_status(created.get("status", "running")),  # type: ignore[union-attr]
            started_at=datetime.now(),
            template=name,
        )
        return sb, info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        sb = RunloopSandbox(provider=self, sandbox_id=sandbox_id)
        sb.info()  # validate
        return sb

    def close(self) -> None:
        self._hc.close()


class RunloopSandbox(Sandbox):
    def __init__(self, provider: RunloopProvider, sandbox_id: str) -> None:
        self._p = provider
        self._id = sandbox_id

    @property
    def id(self) -> str:
        return self._id

    def info(self) -> SandboxInfo:
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}"
        try:
            d = self._p._hc.do("GET", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        name = d.get("name") or None  # type: ignore[union-attr]
        return SandboxInfo(
            id=d.get("id", ""),  # type: ignore[union-attr]
            provider=ProviderName.RUNLOOP,
            status=_map_status(d.get("status", "running")),  # type: ignore[union-attr]
            started_at=datetime.now(),
            template=name,
        )

    def is_running(self) -> bool:
        return self.info().status == SandboxStatus.RUNNING

    def pause(self) -> None:
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}/suspend"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def resume(self) -> None:
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}/resume"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def kill(self) -> None:
        self._p.kill_sandbox(self._id)

    def port_url(self, port: int) -> str:
        raise NotSupportedError("Runloop does not support port_url")

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        start = time.monotonic()
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}/execute_sync"
        body: dict = {"command": req.cmd}
        shell_name = os.environ.get("RUNLOOP_SHELL_NAME")
        if shell_name:
            body["shell_name"] = shell_name
        try:
            out = self._p._hc.do("POST", url, self._p._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        if not out:
            out = {}
        return CommandResult(
            stdout=out.get("stdout", ""),  # type: ignore[union-attr]
            stderr=out.get("stderr", ""),  # type: ignore[union-attr]
            exit_code=out.get("exit_status", 0),  # type: ignore[union-attr]
            duration_ms=_elapsed_ms(start),
        )

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        raise NotSupportedError("Runloop does not support start_command")

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        raise NotSupportedError("Runloop does not support wait_for_handle")

    def kill_process(self, pid: int) -> None:
        raise NotSupportedError("Runloop does not support kill_process")

    def list_processes(self) -> list[ProcessInfo]:
        raise NotSupportedError("Runloop does not support list_processes")

    def read_file(self, path: str) -> bytes:
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}/read_file_contents"
        body = {"file_path": path}
        try:
            out = self._p._hc.do("POST", url, self._p._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        contents = out.get("contents", "") if isinstance(out, dict) else ""
        return contents.encode()

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        url = f"{self._p._base}/v1/devboxes/{quote(self._id, safe='')}/write_file_contents"
        body = {"file_path": path, "contents": content.decode(errors="replace")}
        try:
            self._p._hc.do("POST", url, self._p._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e

    def list_directory(self, path: str) -> list[FileInfo]:
        res = self.run_command(RunCommandRequest(cmd="ls -1 " + shell_quote(path)))
        if res.exit_code != 0:
            raise Exception(f"ls failed: {res.stderr}")
        out: list[FileInfo] = []
        for line in res.stdout.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            p = path.rstrip("/") + "/" + line
            out.append(FileInfo(name=line, path=p))
        return out

    def make_dir(self, path: str) -> None:
        self.run_command(RunCommandRequest(cmd="mkdir -p " + shell_quote(path)))

    def remove(self, path: str) -> None:
        self.run_command(RunCommandRequest(cmd="rm -rf " + shell_quote(path)))

    def exists(self, path: str) -> bool:
        res = self.run_command(RunCommandRequest(cmd="test -e " + shell_quote(path) + " && echo yes || echo no"))
        return res.stdout.strip() == "yes"

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("Runloop does not support create_pty")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("Runloop does not support resize_pty")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("Runloop does not support kill_pty")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("Runloop does not support list_pty")


def _make_runloop_provider(cfg: ProviderConfig) -> Provider:
    return RunloopProvider(cfg)


register_provider(ProviderName.RUNLOOP, _make_runloop_provider)
