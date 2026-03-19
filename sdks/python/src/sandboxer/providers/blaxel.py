from __future__ import annotations

import json
import os
import random
import string
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

_DEFAULT_CONTROL = "https://api.blaxel.ai/v0"


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def _encode_fs_path(path: str) -> str:
    norm = path.lstrip("/")
    if not norm:
        return ""
    return "/".join(quote(seg, safe="") for seg in norm.split("/"))


def _normalize_base_url(url: str | None) -> str:
    if not url:
        return ""
    return url.rstrip("/")


def _strip_name_labels(meta: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in meta.items() if k not in ("name", "sandboxName", "createIfNotExist")}


def _map_deployment_status(s: str | None) -> SandboxStatus:
    u = (s or "").upper()
    if u == "DEPLOYED":
        return SandboxStatus.RUNNING
    if u in ("DEPLOYING", "BUILDING", "UPLOADING"):
        return SandboxStatus.STARTING
    if u in ("DEACTIVATED", "TERMINATED", "DELETING", "DEACTIVATING"):
        return SandboxStatus.STOPPED
    if u == "FAILED":
        return SandboxStatus.ERROR
    return SandboxStatus.RUNNING


def _parse_started_at(raw: str | None) -> datetime:
    if not raw:
        return datetime.now()
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw)
    except ValueError:
        return datetime.now()


def _sandbox_row_to_info(row: dict, sid: str) -> SandboxInfo:
    meta = row.get("metadata") or {}
    spec = row.get("spec") or {}
    runtime = spec.get("runtime") or {}
    mem = runtime.get("memory")
    info = SandboxInfo(
        id=sid,
        provider=ProviderName.BLAXEL,
        status=_map_deployment_status(row.get("status")),
        started_at=_parse_started_at(meta.get("createdAt")),
        metadata=meta.get("labels") or {},
        template=runtime.get("image"),
    )
    if isinstance(mem, int) and mem > 0:
        info.memory_mb = mem
        info.cpus = round(mem / 2048)
    return info


def _map_err(err: HTTPError) -> Exception:
    if err.status == 404:
        return NotFoundError(str(err))
    msg = err.body.decode(errors="replace")
    try:
        j = json.loads(msg)
        if isinstance(j, dict):
            if j.get("message"):
                msg = str(j["message"])
            elif j.get("error"):
                msg = str(j["error"])
    except Exception:
        pass
    return ProviderError(provider="blaxel", message=msg, status_code=err.status)


def _latin1_from_bytes(buf: bytes) -> str:
    return buf.decode("latin-1")


class BlaxelProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        tok = first_non_empty(
            cfg.api_key,
            os.environ.get("BLAXEL_API_KEY"),
            os.environ.get("BL_API_KEY"),
            os.environ.get("SANDBOXER_API_KEY"),
        )
        if not tok:
            raise BadConfigError("Blaxel API key required (api_key, BLAXEL_API_KEY, BL_API_KEY, or SANDBOXER_API_KEY)")
        timeout_s = 30.0
        if cfg.default_timeout_ms:
            timeout_s = cfg.default_timeout_ms / 1000.0
        self._hc = HttpClient(timeout_s=timeout_s)
        self._token = tok
        self._control_base = (cfg.base_url or os.environ.get("BLAXEL_API_BASE") or _DEFAULT_CONTROL).rstrip("/")
        ws = cfg.extra.get("workspace") if isinstance(cfg.extra.get("workspace"), str) else None
        self._workspace = first_non_empty(
            ws or "",
            os.environ.get("BLAXEL_WORKSPACE") or "",
            os.environ.get("BL_WORKSPACE") or "",
        )

    def _control_headers(self) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self._token}"}
        if self._workspace:
            h["X-Blaxel-Workspace"] = self._workspace
        return h

    def _sandbox_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.BLAXEL:
            return []
        url = f"{self._control_base}/sandboxes"
        try:
            rows = self._hc.do("GET", url, self._control_headers())
        except HTTPError as e:
            raise _map_err(e) from e
        if not rows or not isinstance(rows, list):
            return []
        out: list[SandboxInfo] = []
        for s in rows:
            if not isinstance(s, dict):
                continue
            meta = s.get("metadata") or {}
            name = meta.get("name")
            if not name:
                continue
            if filter.metadata_filter:
                labels = meta.get("labels") or {}
                hay = " ".join([*labels.values(), name])
                if filter.metadata_filter not in hay:
                    continue
            out.append(_sandbox_row_to_info(s, name))
            if filter.limit and filter.limit > 0 and len(out) >= filter.limit:
                break
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        url = f"{self._control_base}/sandboxes/{quote(sandbox_id, safe='')}"
        try:
            self._hc.do("DELETE", url, self._control_headers())
        except HTTPError as e:
            raise _map_err(e) from e

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        meta = req.metadata or {}
        name = meta.get("name") or meta.get("sandboxName")
        if not name:
            suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
            name = f"sandboxer-{int(time.time() * 1000):x}-{suffix}"

        runtime: dict = {"image": req.template or "blaxel/base-image:latest"}
        if req.memory_mb is not None:
            runtime["memory"] = req.memory_mb
        elif req.cpus is not None:
            runtime["memory"] = req.cpus * 2048
        else:
            runtime["memory"] = 4096

        if req.envs:
            runtime["envs"] = [{"name": k, "value": v} for k, v in req.envs.items()]

        md: dict = {"name": name}
        labs = _strip_name_labels(dict(meta)) if meta else {}
        if labs:
            md["labels"] = labs
        body: dict = {"metadata": md, "spec": {"runtime": runtime}}
        q = "?createIfNotExist=true" if meta.get("createIfNotExist") == "true" else ""
        url = f"{self._control_base}/sandboxes{q}"
        try:
            created = self._hc.do("POST", url, self._control_headers(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(created, dict):
            raise ProviderError("blaxel", "invalid create sandbox response")

        base_url = _normalize_base_url((created.get("metadata") or {}).get("url"))
        if not base_url:
            get_url = f"{self._control_base}/sandboxes/{quote(name, safe='')}"
            try:
                again = self._hc.do("GET", get_url, self._control_headers())
            except HTTPError as e:
                raise _map_err(e) from e
            if isinstance(again, dict):
                base_url = _normalize_base_url((again.get("metadata") or {}).get("url"))
        if not base_url:
            raise ProviderError("blaxel", "sandbox created but no endpoint URL in response (metadata.url)")

        sb = BlaxelSandbox(self, name, base_url)
        info = _sandbox_row_to_info(created, name)
        return sb, info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        url = f"{self._control_base}/sandboxes/{quote(sandbox_id, safe='')}"
        try:
            row = self._hc.do("GET", url, self._control_headers())
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(row, dict):
            raise ProviderError("blaxel", "invalid get sandbox response")
        meta = row.get("metadata") or {}
        name = meta.get("name") or sandbox_id
        base_url = _normalize_base_url(meta.get("url"))
        if not base_url:
            raise ProviderError("blaxel", "sandbox has no endpoint URL (metadata.url); cannot attach")
        return BlaxelSandbox(self, name, base_url)

    def close(self) -> None:
        self._hc.close()


class BlaxelSandbox(Sandbox):
    def __init__(self, provider: BlaxelProvider, sandbox_id: str, base_url: str) -> None:
        self._p = provider
        self._id = sandbox_id
        self._base = base_url.rstrip("/")

    @property
    def id(self) -> str:
        return self._id

    def _fs_url(self, path: str) -> str:
        enc = _encode_fs_path(path)
        return f"{self._base}/filesystem/{enc}"

    def info(self) -> SandboxInfo:
        url = f"{self._p._control_base}/sandboxes/{quote(self._id, safe='')}"
        try:
            row = self._p._hc.do("GET", url, self._p._control_headers())
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(row, dict):
            raise ProviderError("blaxel", "invalid sandbox info response")
        return _sandbox_row_to_info(row, self._id)

    def is_running(self) -> bool:
        i = self.info()
        return i.status in (SandboxStatus.RUNNING, SandboxStatus.STARTING)

    def pause(self) -> None:
        raise NotSupportedError("blaxel: pause not supported by API")

    def resume(self) -> None:
        raise NotSupportedError("blaxel: resume not supported by API")

    def kill(self) -> None:
        self._p.kill_sandbox(self._id)

    def port_url(self, port: int) -> str:
        return f"{self._base}/port/{port}"

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        start = time.monotonic()
        body: dict = {"command": req.cmd, "waitForCompletion": True}
        if req.cwd:
            body["workingDir"] = req.cwd
        if req.timeout_seconds is not None:
            body["timeout"] = req.timeout_seconds
        if req.env:
            body["env"] = req.env
        url = f"{self._base}/process"
        try:
            out = self._p._hc.do("POST", url, self._p._sandbox_headers(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(out, dict):
            out = {}
        code = int(out.get("exitCode") or 0)
        return CommandResult(
            stdout=str(out.get("stdout") or ""),
            stderr=str(out.get("stderr") or ""),
            exit_code=code,
            duration_ms=_elapsed_ms(start),
        )

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        body: dict = {"command": req.cmd, "waitForCompletion": False}
        if req.cwd:
            body["workingDir"] = req.cwd
        if req.env:
            body["env"] = req.env
        url = f"{self._base}/process"
        try:
            out = self._p._hc.do("POST", url, self._p._sandbox_headers(), body)
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(out, dict):
            raise ProviderError("blaxel", "invalid start command response")
        handle = str(out.get("pid") or "")
        if not handle or not handle.isdigit():
            raise ProviderError("blaxel", "process start did not return pid")
        return int(handle, 10), handle

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        start = time.monotonic()
        deadline = time.monotonic() + 3600.0
        while time.monotonic() < deadline:
            url = f"{self._base}/process/{quote(handle_id, safe='')}"
            try:
                last = self._p._hc.do("GET", url, self._p._sandbox_headers())
            except HTTPError as e:
                raise _map_err(e) from e
            if not isinstance(last, dict):
                time.sleep(0.4)
                continue
            st = str(last.get("status") or "").lower()
            if st in ("completed", "failed", "killed", "stopped"):
                code = int(last.get("exitCode") or (0 if st == "completed" else 1))
                return CommandResult(
                    stdout=str(last.get("stdout") or ""),
                    stderr=str(last.get("stderr") or ""),
                    exit_code=code,
                    duration_ms=_elapsed_ms(start),
                )
            time.sleep(0.4)
        raise ProviderError("blaxel", "wait_for_handle: timeout waiting for process")

    def kill_process(self, pid: int) -> None:
        url = f"{self._base}/process/{quote(str(pid), safe='')}/kill"
        try:
            self._p._hc.do("DELETE", url, self._p._sandbox_headers())
        except HTTPError as e:
            raise _map_err(e) from e

    def list_processes(self) -> list[ProcessInfo]:
        url = f"{self._base}/process"
        try:
            rows = self._p._hc.do("GET", url, self._p._sandbox_headers())
        except HTTPError as e:
            raise _map_err(e) from e
        if not rows or not isinstance(rows, list):
            return []
        out: list[ProcessInfo] = []
        for p in rows:
            if not isinstance(p, dict):
                continue
            pid_s = str(p.get("pid") or "0")
            try:
                pid = int(pid_s, 10)
            except ValueError:
                pid = 0
            out.append(ProcessInfo(pid=pid, command=str(p.get("command") or "")))
        return out

    def read_file(self, path: str) -> bytes:
        url = self._fs_url(path)
        h = dict(self._p._sandbox_headers())
        h["Accept"] = "application/octet-stream,*/*"
        try:
            _, raw = self._p._hc.do_raw("GET", url, h)
        except HTTPError as e:
            if e.status == 404:
                raise NotFoundError(str(e)) from e
            raise _map_err(e) from e
        return raw

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        _ = user
        body: dict = {"content": _latin1_from_bytes(content)}
        if mode is not None:
            body["permissions"] = oct(mode & 0o777)[2:].zfill(3)
        try:
            self._p._hc.do("PUT", self._fs_url(path), self._p._sandbox_headers(), body)
        except HTTPError as e:
            raise _map_err(e) from e

    def list_directory(self, path: str) -> list[FileInfo]:
        try:
            d = self._p._hc.do("GET", self._fs_url(path), self._p._sandbox_headers())
        except HTTPError as e:
            raise _map_err(e) from e
        if not isinstance(d, dict):
            return []
        out: list[FileInfo] = []
        for f in d.get("files") or []:
            if not isinstance(f, dict):
                continue
            out.append(
                FileInfo(
                    name=str(f.get("name") or ""),
                    path=str(f.get("path") or ""),
                    is_dir=False,
                    size=int(f.get("size") or 0),
                )
            )
        for sub in d.get("subdirectories") or []:
            if not isinstance(sub, dict):
                continue
            out.append(
                FileInfo(
                    name=str(sub.get("name") or ""),
                    path=str(sub.get("path") or ""),
                    is_dir=True,
                    size=0,
                )
            )
        return out

    def make_dir(self, path: str) -> None:
        try:
            self._p._hc.do("PUT", self._fs_url(path), self._p._sandbox_headers(), {"isDirectory": True})
        except HTTPError as e:
            raise _map_err(e) from e

    def remove(self, path: str) -> None:
        url = f"{self._fs_url(path)}?recursive=true"
        try:
            self._p._hc.do("DELETE", url, self._p._sandbox_headers())
        except HTTPError as e:
            raise _map_err(e) from e

    def exists(self, path: str) -> bool:
        try:
            self._p._hc.do_raw("GET", self._fs_url(path), self._p._sandbox_headers())
        except HTTPError as e:
            if e.status == 404:
                return False
            raise _map_err(e) from e
        return True

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("blaxel: PTY not exposed in sandbox API")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("blaxel: PTY not exposed in sandbox API")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("blaxel: PTY not exposed in sandbox API")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("blaxel: PTY not exposed in sandbox API")


def _make_blaxel_provider(cfg: ProviderConfig) -> Provider:
    return BlaxelProvider(cfg)


register_provider(ProviderName.BLAXEL, _make_blaxel_provider)
