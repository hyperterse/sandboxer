from __future__ import annotations

import io
import os
import time
from datetime import datetime
from urllib.parse import quote, urlencode

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

_DEFAULT_API = "https://app.daytona.io/api"
_DEFAULT_TOOLBOX = "https://proxy.app.daytona.io/toolbox"


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def _map_err(err: HTTPError) -> Exception:
    if err.status == 404:
        return NotFoundError(str(err))
    msg = err.body.decode(errors="replace")
    return ProviderError(provider="daytona", message=msg, status_code=err.status)


def _map_state(state: str) -> SandboxStatus:
    s = state.lower()
    if s in ("stopped", "archived"):
        return SandboxStatus.STOPPED
    if s in ("starting", "creating"):
        return SandboxStatus.STARTING
    return SandboxStatus.RUNNING


class DaytonaProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        tok = first_non_empty(cfg.api_key, os.environ.get("DAYTONA_API_KEY"), os.environ.get("DAYTONA_TOKEN"))
        if not tok:
            raise BadConfigError("Daytona API token required (api_key, DAYTONA_API_KEY, or DAYTONA_TOKEN)")
        timeout_s = 30.0
        if cfg.default_timeout_ms:
            timeout_s = cfg.default_timeout_ms / 1000.0
        self._hc = HttpClient(timeout_s=timeout_s)
        self._token = tok
        self._api_base = (cfg.base_url or _DEFAULT_API).rstrip("/")
        self._tool_base = (os.environ.get("DAYTONA_TOOLBOX_BASE_URL") or _DEFAULT_TOOLBOX).rstrip("/")

    def _hdr(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.DAYTONA:
            return []
        url = f"{self._api_base}/sandbox"
        if filter.limit and filter.limit > 0:
            url += f"?limit={filter.limit}"
        try:
            rows = self._hc.do("GET", url, self._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        if not rows:
            return []
        out: list[SandboxInfo] = []
        for s in rows:  # type: ignore[union-attr]
            metadata = s.get("labels") or {}
            if filter.metadata_filter and not any(filter.metadata_filter in v for v in metadata.values()):
                continue
            sid = first_non_empty(s.get("id"), s.get("name"))
            info = SandboxInfo(
                id=sid,
                provider=ProviderName.DAYTONA,
                status=_map_state(s.get("state", "running")),
                started_at=datetime.now(),
                metadata=metadata,
                template=s.get("image") or None,
            )
            out.append(info)
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        url = f"{self._api_base}/sandbox/{quote(sandbox_id, safe='')}"
        try:
            self._hc.do("DELETE", url, self._hdr())
        except HTTPError as e:
            raise _map_err(e) from e

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        body: dict = {"env": req.metadata}
        if req.template:
            body["image"] = req.template
        if req.envs:
            body["envVars"] = req.envs
        if req.cpus is not None or req.memory_mb is not None:
            res: dict = {}
            if req.cpus is not None:
                res["cpu"] = req.cpus
            if req.memory_mb is not None:
                res["memory"] = req.memory_mb
            body["resources"] = res
        url = f"{self._api_base}/sandbox"
        try:
            created = self._hc.do("POST", url, self._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        sid = first_non_empty(created.get("id"), created.get("name"))  # type: ignore[union-attr]
        sb = DaytonaSandbox(provider=self, sandbox_id=sid)
        try:
            info = sb.info()
        except Exception:
            info = SandboxInfo(
                id=sid,
                provider=ProviderName.DAYTONA,
                status=SandboxStatus.RUNNING,
                started_at=datetime.now(),
                template=created.get("image") or None,  # type: ignore[union-attr]
            )
        return sb, info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        sb = DaytonaSandbox(provider=self, sandbox_id=sandbox_id)
        sb.info()  # validate existence
        return sb

    def close(self) -> None:
        self._hc.close()


class DaytonaSandbox(Sandbox):
    def __init__(self, provider: DaytonaProvider, sandbox_id: str) -> None:
        self._p = provider
        self._id = sandbox_id

    @property
    def id(self) -> str:
        return self._id

    def info(self) -> SandboxInfo:
        url = f"{self._p._api_base}/sandbox/{quote(self._id, safe='')}"
        try:
            d = self._p._hc.do("GET", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        sid = first_non_empty(d.get("id"), d.get("name"))  # type: ignore[union-attr]
        return SandboxInfo(
            id=sid,
            provider=ProviderName.DAYTONA,
            status=_map_state(d.get("state", "running")),  # type: ignore[union-attr]
            started_at=datetime.now(),
            template=d.get("image") or None,  # type: ignore[union-attr]
        )

    def is_running(self) -> bool:
        i = self.info()
        return i.status in (SandboxStatus.RUNNING, SandboxStatus.STARTING)

    def pause(self) -> None:
        url = f"{self._p._api_base}/sandbox/{quote(self._id, safe='')}/stop"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def resume(self) -> None:
        url = f"{self._p._api_base}/sandbox/{quote(self._id, safe='')}/start"
        try:
            self._p._hc.do("POST", url, self._p._hdr(), {})
        except HTTPError as e:
            raise _map_err(e) from e

    def kill(self) -> None:
        self._p.kill_sandbox(self._id)

    def port_url(self, port: int) -> str:
        raise NotSupportedError("Daytona does not support port_url")

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        start = time.monotonic()
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/process/execute"
        body: dict = {"command": req.cmd}
        if req.cwd:
            body["cwd"] = req.cwd
        if req.timeout_seconds is not None:
            body["timeout"] = req.timeout_seconds
        if req.env:
            body["env"] = req.env
        try:
            out = self._p._hc.do("POST", url, self._p._hdr(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        if not out:
            out = {}
        code = out.get("exitCode", out.get("exit_code", 0))  # type: ignore[union-attr]
        stdout = first_non_empty(out.get("stdout"), out.get("result"))  # type: ignore[union-attr]
        return CommandResult(
            stdout=stdout,
            stderr=out.get("stderr", ""),  # type: ignore[union-attr]
            exit_code=code,
            duration_ms=_elapsed_ms(start),
        )

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        raise NotSupportedError("Daytona does not support start_command")

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        raise NotSupportedError("Daytona does not support wait_for_handle")

    def kill_process(self, pid: int) -> None:
        raise NotSupportedError("Daytona does not support kill_process")

    def list_processes(self) -> list[ProcessInfo]:
        raise NotSupportedError("Daytona does not support list_processes")

    def read_file(self, path: str) -> bytes:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files/download?{urlencode({'path': path})}"
        try:
            _, data = self._p._hc.do_raw("GET", url, self._p._hdr())
        except HTTPError as e:
            if e.status == 404:
                raise NotFoundError(f"file not found: {path}") from e
            raise _map_err(e) from e
        return data

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files/upload?{urlencode({'path': path})}"
        h = self._p._hdr()
        boundary = "----SandboxerBoundary"
        body = io.BytesIO()
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="path"\r\n\r\n')
        body.write(path.encode())
        body.write(b"\r\n")
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="file"; filename="file"\r\n')
        body.write(b"Content-Type: application/octet-stream\r\n\r\n")
        body.write(content)
        body.write(b"\r\n")
        body.write(f"--{boundary}--\r\n".encode())
        h["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        try:
            self._p._hc.do_raw("POST", url, h, content=body.getvalue())
        except HTTPError as e:
            raise _map_err(e) from e

    def list_directory(self, path: str) -> list[FileInfo]:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files?{urlencode({'path': path})}"
        try:
            _, raw = self._p._hc.do_raw("GET", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e
        import json

        try:
            entries = json.loads(raw)
        except json.JSONDecodeError:
            return []
        # Could be a list or a wrapper with "entries" key
        if isinstance(entries, dict):
            entries = entries.get("entries", [])
        out: list[FileInfo] = []
        for e in entries:
            p = e.get("path") or (path.rstrip("/") + "/" + e.get("name", ""))
            out.append(
                FileInfo(
                    name=e.get("name", ""),
                    path=p,
                    is_dir=e.get("isDir", False),
                    size=e.get("size", 0),
                )
            )
        return out

    def make_dir(self, path: str) -> None:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files/folder?{urlencode({'path': path, 'mode': '755'})}"
        try:
            self._p._hc.do_raw("POST", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e

    def remove(self, path: str) -> None:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files?{urlencode({'path': path})}"
        try:
            self._p._hc.do_raw("DELETE", url, self._p._hdr())
        except HTTPError as e:
            raise _map_err(e) from e

    def exists(self, path: str) -> bool:
        url = f"{self._p._tool_base}/{quote(self._id, safe='')}/files/info?{urlencode({'path': path})}"
        try:
            self._p._hc.do_raw("GET", url, self._p._hdr())
        except HTTPError as e:
            if e.status == 404:
                return False
            raise _map_err(e) from e
        return True

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("Daytona does not support create_pty")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("Daytona does not support resize_pty")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("Daytona does not support kill_pty")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("Daytona does not support list_pty")


def _make_daytona_provider(cfg: ProviderConfig) -> Provider:
    return DaytonaProvider(cfg)


register_provider(ProviderName.DAYTONA, _make_daytona_provider)
