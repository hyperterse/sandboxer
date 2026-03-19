from __future__ import annotations

import base64
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
from .._connect_proto import unary_post, stream_post, CONNECT_TIMEOUT_MS
from .._util import first_non_empty, shell_quote
from ..registry import register_provider

_DEFAULT_API_BASE = "https://api.e2b.app"
_DEFAULT_ENVD_PORT = 49983
_HEADER_API_KEY = "X-API-Key"
_HEADER_ACCESS_TOKEN = "X-Access-Token"


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def _map_err(name: str, err: HTTPError) -> Exception:
    if err.status == 404:
        return NotFoundError(str(err))
    msg = err.body.decode(errors="replace")
    if len(msg) > 256:
        msg = msg[:256] + "..."
    return ProviderError(provider=name, message=msg, status_code=err.status)


def _metadata_match(m: dict[str, str], needle: str) -> bool:
    if not needle:
        return True
    for v in m.values():
        if needle in v:
            return True
    return False


class E2BProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        key = first_non_empty(cfg.api_key, os.environ.get("E2B_API_KEY"))
        if not key:
            raise BadConfigError("E2B API key required (api_key or E2B_API_KEY)")
        timeout_s = 30.0
        if cfg.default_timeout_ms:
            timeout_s = cfg.default_timeout_ms / 1000.0
        self._hc = HttpClient(timeout_s=timeout_s)
        self._api_key = key
        self._api_base = (cfg.base_url or _DEFAULT_API_BASE).rstrip("/")
        port_str = os.environ.get("E2B_ENVD_PORT", "")
        self._port = int(port_str) if port_str.isdigit() else _DEFAULT_ENVD_PORT
        self._tpl = os.environ.get("E2B_TEMPLATE_ID", "base")

    def _api_headers(self) -> dict[str, str]:
        return {_HEADER_API_KEY: self._api_key}

    def _envd_base(self, sandbox_id: str) -> str:
        return f"https://{self._port}-{sandbox_id}.e2b.app"

    def _envd_headers(self, token: str | None) -> dict[str, str]:
        h: dict[str, str] = {}
        if token:
            h[_HEADER_ACCESS_TOKEN] = token
        return h

    def _get_sandbox_detail(self, sandbox_id: str) -> dict:
        url = f"{self._api_base}/sandboxes/{quote(sandbox_id, safe='')}"
        try:
            result = self._hc.do("GET", url, self._api_headers())
        except HTTPError as e:
            raise _map_err("e2b", e) from e
        return result  # type: ignore[return-value]

    def _detail_to_info(self, d: dict, fallback_tpl: str, token: str | None = None) -> SandboxInfo:
        tpl = d.get("templateID") or fallback_tpl
        state = d.get("state", "running")
        status = SandboxStatus.PAUSED if state == "paused" else SandboxStatus.RUNNING
        started = datetime.now()
        if d.get("startedAt"):
            try:
                started = datetime.fromisoformat(d["startedAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        expires: datetime | None = None
        if d.get("endAt"):
            try:
                expires = datetime.fromisoformat(d["endAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        cpus = d.get("cpuCount") or None
        memory = d.get("memoryMB") or None
        return SandboxInfo(
            id=d.get("sandboxID", ""),
            provider=ProviderName.E2B,
            template=tpl,
            status=status,
            started_at=started,
            expires_at=expires,
            metadata=d.get("metadata") or {},
            cpus=cpus if cpus and cpus > 0 else None,
            memory_mb=memory if memory and memory > 0 else None,
        )

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.E2B:
            return []
        url = f"{self._api_base}/v2/sandboxes"
        if filter.limit and filter.limit > 0:
            url += f"?limit={filter.limit}"
        try:
            listed = self._hc.do("GET", url, self._api_headers())
        except HTTPError as e:
            raise _map_err("e2b", e) from e
        if not listed:
            return []
        out: list[SandboxInfo] = []
        for s in listed:  # type: ignore[union-attr]
            metadata = s.get("metadata") or {}
            if filter.metadata_filter and not _metadata_match(metadata, filter.metadata_filter):
                continue
            state = s.get("state", "running")
            status = SandboxStatus.PAUSED if state == "paused" else SandboxStatus.RUNNING
            started = datetime.now()
            if s.get("startedAt"):
                try:
                    started = datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass
            expires: datetime | None = None
            if s.get("endAt"):
                try:
                    expires = datetime.fromisoformat(s["endAt"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass
            cpus = s.get("cpuCount") or None
            memory = s.get("memoryMB") or None
            out.append(
                SandboxInfo(
                    id=s.get("sandboxID", ""),
                    provider=ProviderName.E2B,
                    template=s.get("templateID"),
                    status=status,
                    started_at=started,
                    expires_at=expires,
                    metadata=metadata,
                    cpus=cpus if cpus and cpus > 0 else None,
                    memory_mb=memory if memory and memory > 0 else None,
                )
            )
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        url = f"{self._api_base}/sandboxes/{quote(sandbox_id, safe='')}"
        try:
            self._hc.do("DELETE", url, self._api_headers())
        except HTTPError as e:
            raise _map_err("e2b", e) from e

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        tpl = self._tpl
        if req.template:
            tpl = req.template
        body: dict = {
            "templateID": tpl,
            "metadata": req.metadata,
            "envVars": req.envs,
        }
        if req.timeout_seconds is not None:
            body["timeout"] = req.timeout_seconds
        if req.cpus is not None:
            body["cpuCount"] = req.cpus
        if req.memory_mb is not None:
            body["memoryMB"] = req.memory_mb
        url = f"{self._api_base}/sandboxes"
        try:
            created = self._hc.do("POST", url, self._api_headers(), body)
        except HTTPError as e:
            raise _map_err("e2b", e) from e
        sandbox_id = created["sandboxID"]  # type: ignore[index]
        token = created.get("envdAccessToken")  # type: ignore[union-attr]
        detail = self._get_sandbox_detail(sandbox_id)
        info = self._detail_to_info(detail, tpl, token)
        sb = E2BSandbox(provider=self, sandbox_id=sandbox_id, token=token)
        return sb, info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        detail = self._get_sandbox_detail(sandbox_id)
        token = detail.get("envdAccessToken")
        return E2BSandbox(provider=self, sandbox_id=sandbox_id, token=token)

    def close(self) -> None:
        self._hc.close()


class E2BSandbox(Sandbox):
    def __init__(self, provider: E2BProvider, sandbox_id: str, token: str | None = None) -> None:
        self._provider = provider
        self._id = sandbox_id
        self._token = token

    @property
    def id(self) -> str:
        return self._id

    def info(self) -> SandboxInfo:
        detail = self._provider._get_sandbox_detail(self._id)
        return self._provider._detail_to_info(detail, self._provider._tpl, self._token)

    def is_running(self) -> bool:
        detail = self._provider._get_sandbox_detail(self._id)
        return detail.get("state") == "running"

    def pause(self) -> None:
        url = f"{self._provider._api_base}/sandboxes/{quote(self._id, safe='')}/pause"
        try:
            self._provider._hc.do("POST", url, self._provider._api_headers(), {})
        except HTTPError as e:
            raise _map_err("e2b", e) from e

    def resume(self) -> None:
        url = f"{self._provider._api_base}/sandboxes/{quote(self._id, safe='')}/resume"
        try:
            self._provider._hc.do("POST", url, self._provider._api_headers(), {})
        except HTTPError as e:
            raise _map_err("e2b", e) from e

    def kill(self) -> None:
        self._provider.kill_sandbox(self._id)

    def port_url(self, port: int) -> str:
        return f"https://{port}-{self._id}.e2b.app"

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        start = time.monotonic()
        url = self._provider._envd_base(self._id) + "/process.Process/Start"
        h = self._provider._envd_headers(self._token)
        if req.timeout_seconds is not None and req.timeout_seconds > 0:
            h[CONNECT_TIMEOUT_MS] = str(req.timeout_seconds * 1000)
        proc: dict = {
            "cmd": "sh",
            "args": ["-c", req.cmd],
            "envs": req.env,
        }
        if req.cwd:
            proc["cwd"] = req.cwd
        body = {"process": proc}
        stdout_parts: list[str] = []
        stderr_parts: list[str] = []
        exit_code = -1
        saw_end = False

        def on_msg(msg: dict) -> None:
            nonlocal exit_code, saw_end
            event = msg.get("event")
            if not isinstance(event, dict):
                return
            data = event.get("data")
            if isinstance(data, dict):
                _append_b64(stdout_parts, data.get("stdout"))
                _append_b64(stderr_parts, data.get("stderr"))
            end = event.get("end")
            if isinstance(end, dict):
                ec = end.get("exitCode", end.get("exit_code", 0))
                exit_code = ec if isinstance(ec, int) else 0
                saw_end = True

        stream_post(self._provider._hc, url, h, body, on_msg)
        if not saw_end:
            exit_code = -1
        return CommandResult(
            stdout="".join(stdout_parts),
            stderr="".join(stderr_parts),
            exit_code=exit_code,
            duration_ms=_elapsed_ms(start),
        )

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        raise NotSupportedError("E2B does not support start_command")

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        raise NotSupportedError("E2B does not support wait_for_handle")

    def kill_process(self, pid: int) -> None:
        raise NotSupportedError("E2B does not support kill_process")

    def list_processes(self) -> list[ProcessInfo]:
        raise NotSupportedError("E2B does not support list_processes")

    def read_file(self, path: str) -> bytes:
        url = self._provider._envd_base(self._id) + "/files?" + urlencode({"path": path})
        h = self._provider._envd_headers(self._token)
        try:
            _, data = self._provider._hc.do_raw("GET", url, h)
        except HTTPError as e:
            if e.status == 404:
                raise NotFoundError(f"file not found: {path}") from e
            raise _map_err("e2b", e) from e
        return data

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        url = self._provider._envd_base(self._id) + "/files"
        h = self._provider._envd_headers(self._token)
        # multipart upload
        import io

        boundary = "----SandboxerBoundary"
        body = io.BytesIO()
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="path"\r\n\r\n')
        body.write(path.encode())
        body.write(b"\r\n")
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="file"; filename="blob"\r\n')
        body.write(b"Content-Type: application/octet-stream\r\n\r\n")
        body.write(content)
        body.write(b"\r\n")
        body.write(f"--{boundary}--\r\n".encode())
        h["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        try:
            self._provider._hc.do_raw("POST", url, h, content=body.getvalue())
        except HTTPError as e:
            raise _map_err("e2b", e) from e

    def list_directory(self, path: str) -> list[FileInfo]:
        url = self._provider._envd_base(self._id) + "/filesystem.Filesystem/ListDir"
        h = self._provider._envd_headers(self._token)
        result = unary_post(self._provider._hc, url, h, {"path": path, "depth": 1})
        if not result:
            return []
        entries = result.get("entries", []) if isinstance(result, dict) else []
        out: list[FileInfo] = []
        for e in entries:
            is_dir = "DIRECTORY" in (e.get("type", "") or "")
            size = 0
            raw_size = e.get("size")
            if isinstance(raw_size, (int, float)):
                size = int(raw_size)
            elif isinstance(raw_size, str) and raw_size.isdigit():
                size = int(raw_size)
            file_mode = e.get("mode") or None
            out.append(
                FileInfo(
                    name=e.get("name", ""),
                    path=e.get("path", ""),
                    is_dir=is_dir,
                    size=size,
                    mode=file_mode if file_mode and file_mode != 0 else None,
                )
            )
        return out

    def make_dir(self, path: str) -> None:
        url = self._provider._envd_base(self._id) + "/filesystem.Filesystem/MakeDir"
        h = self._provider._envd_headers(self._token)
        unary_post(self._provider._hc, url, h, {"path": path})

    def remove(self, path: str) -> None:
        self.run_command(RunCommandRequest(cmd="rm -rf " + shell_quote(path)))

    def exists(self, path: str) -> bool:
        url = self._provider._envd_base(self._id) + "/files?" + urlencode({"path": path})
        h = self._provider._envd_headers(self._token)
        try:
            self._provider._hc.do_raw("GET", url, h)
        except HTTPError as e:
            if e.status == 404:
                return False
            raise _map_err("e2b", e) from e
        return True

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("E2B does not support create_pty")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("E2B does not support resize_pty")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("E2B does not support kill_pty")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("E2B does not support list_pty")


def _append_b64(parts: list[str], val: str | None) -> None:
    if not val:
        return
    try:
        decoded = base64.b64decode(val).decode(errors="replace")
        parts.append(decoded)
    except Exception:
        parts.append(val)


def _make_e2b_provider(cfg: ProviderConfig) -> Provider:
    return E2BProvider(cfg)


register_provider(ProviderName.E2B, _make_e2b_provider)
