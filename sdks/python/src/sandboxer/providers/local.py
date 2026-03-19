from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tarfile
import threading
import time
from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath

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
from ..provider import Provider, Sandbox, AsyncProvider, AsyncSandbox
from ..errors import NotFoundError, NotSupportedError, ProviderError, BadConfigError
from .._util import normalize_path
from ..registry import register_provider

_LABEL_MANAGED = "sandboxer.managed"
_LABEL_PROVIDER = "sandboxer.provider"


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def _docker_run(args: list[str], input_data: bytes | None = None) -> bytes:
    cmd = ["docker"] + args
    result = subprocess.run(cmd, capture_output=True, input=input_data)
    if result.returncode != 0:
        stderr = result.stderr.decode(errors="replace").strip()
        raise ProviderError(provider="local", message=f"docker {' '.join(args[:2])}: {stderr}")
    return result.stdout


def _sanitize_label_key(k: str) -> str:
    out = []
    for ch in k:
        if ch.isalnum() or ch in (".", "_", "-"):
            out.append(ch)
        else:
            out.append("_")
    return "".join(out) or "key"


def _metadata_contains(m: dict[str, str], needle: str) -> bool:
    if not needle:
        return True
    for v in m.values():
        if needle in v:
            return True
    return False


class LocalProvider(Provider):
    def __init__(self, cfg: ProviderConfig) -> None:
        import shutil

        if not shutil.which("docker"):
            raise BadConfigError("docker CLI not found in PATH")
        # Validate docker is working
        try:
            subprocess.run(["docker", "info"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            raise BadConfigError(f"docker info failed: {e}") from e
        self._cfg = cfg

    def _inspect(self, container_id: str) -> SandboxInfo:
        raw = _docker_run(["inspect", container_id])
        try:
            wrap = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ProviderError(provider="local", message=f"inspect decode: {e}") from e
        if not wrap:
            raise NotFoundError(f"container {container_id} not found")
        c = wrap[0]
        labels = c.get("Config", {}).get("Labels", {}) or {}
        if labels.get(_LABEL_MANAGED) != "true":
            raise NotFoundError(f"container {container_id} not managed by sandboxer")
        state = c.get("State", {})
        if state.get("Running"):
            st = SandboxStatus.RUNNING
        elif state.get("Paused"):
            st = SandboxStatus.PAUSED
        elif state.get("Status") in ("created", "restarting"):
            st = SandboxStatus.STARTING
        elif state.get("OOMKilled") or state.get("ExitCode", 0) != 0:
            st = SandboxStatus.ERROR
        else:
            st = SandboxStatus.STOPPED
        meta: dict[str, str] = {}
        for k, v in labels.items():
            if k.startswith("sandboxer.meta."):
                meta[k.removeprefix("sandboxer.meta.")] = v
        started = datetime.now()
        if state.get("StartedAt"):
            try:
                started = datetime.fromisoformat(state["StartedAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        image = c.get("Config", {}).get("Image", "")
        return SandboxInfo(
            id=c.get("Id", container_id),
            provider=ProviderName.LOCAL,
            template=image or None,
            status=st,
            started_at=started,
            metadata=meta,
        )

    def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        filter = filter or ListSandboxesFilter()
        if filter.provider is not None and filter.provider != ProviderName.LOCAL:
            return []
        raw = _docker_run(["ps", "-a", "-q", "--no-trunc", "--filter", f"label={_LABEL_MANAGED}=true"])
        ids = raw.decode().strip().split()
        out: list[SandboxInfo] = []
        for cid in ids:
            if not cid:
                continue
            try:
                info = self._inspect(cid)
            except Exception:
                continue
            if filter.metadata_filter and not _metadata_contains(info.metadata, filter.metadata_filter):
                continue
            out.append(info)
            if filter.limit and filter.limit > 0 and len(out) >= filter.limit:
                break
        return out

    def kill_sandbox(self, sandbox_id: str) -> None:
        try:
            _docker_run(["rm", "-f", sandbox_id])
        except ProviderError:
            pass  # already gone

    def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[Sandbox, SandboxInfo]:
        req = req or CreateSandboxRequest()
        image = req.template or "alpine:latest"
        args = ["create", "--label", f"{_LABEL_MANAGED}=true", "--label", f"{_LABEL_PROVIDER}=local"]
        for k, v in req.metadata.items():
            args.extend(["--label", f"sandboxer.meta.{_sanitize_label_key(k)}={v}"])
        for k, v in req.envs.items():
            args.extend(["-e", f"{k}={v}"])
        if req.cpus is not None and req.cpus > 0:
            args.extend(["--cpus", str(req.cpus)])
        if req.memory_mb is not None and req.memory_mb > 0:
            args.extend(["-m", f"{req.memory_mb}m"])
        args.extend([image, "sleep", "infinity"])
        out = _docker_run(args)
        cid = out.decode().strip()
        try:
            _docker_run(["start", cid])
        except ProviderError:
            _docker_run(["rm", "-f", cid])
            raise
        info = self._inspect(cid)
        return LocalSandbox(cid), info

    def attach_sandbox(self, sandbox_id: str) -> Sandbox:
        info = self._inspect(sandbox_id)
        if info.status != SandboxStatus.RUNNING:
            raise NotFoundError(f"container {sandbox_id} is not running")
        return LocalSandbox(sandbox_id)

    def close(self) -> None:
        pass


class LocalSandbox(Sandbox):
    def __init__(self, container_id: str) -> None:
        self._id = container_id.strip()
        self._handle_seq = 0
        self._handle_lock = threading.Lock()
        self._handles: dict[str, threading.Event] = {}
        self._handle_results: dict[str, tuple[CommandResult, Exception | None]] = {}

    @property
    def id(self) -> str:
        return self._id

    def info(self) -> SandboxInfo:
        p = LocalProvider.__new__(LocalProvider)
        p._cfg = ProviderConfig()
        return p._inspect(self._id)

    def is_running(self) -> bool:
        return self.info().status == SandboxStatus.RUNNING

    def pause(self) -> None:
        _docker_run(["pause", self._id])

    def resume(self) -> None:
        _docker_run(["unpause", self._id])

    def kill(self) -> None:
        _docker_run(["rm", "-f", self._id])

    def port_url(self, port: int) -> str:
        raw = _docker_run(["inspect", self._id])
        wrap = json.loads(raw)
        if not wrap:
            raise ProviderError(provider="local", message="inspect failed")
        ports = wrap[0].get("NetworkSettings", {}).get("Ports", {})
        key = f"{port}/tcp"
        binds = ports.get(key, [])
        if not binds:
            raise NotSupportedError(f"port {port} not exposed")
        host_ip = binds[0].get("HostIp", "") or "127.0.0.1"
        if host_ip == "0.0.0.0":
            host_ip = "127.0.0.1"
        return f"http://{host_ip}:{binds[0]['HostPort']}"

    def run_command(self, req: RunCommandRequest) -> CommandResult:
        start = time.monotonic()
        args = ["exec", "-i"]
        if req.user:
            args.extend(["-u", req.user])
        if req.cwd:
            args.extend(["-w", req.cwd])
        args.extend([self._id, "/bin/sh", "-c", req.cmd])
        cmd = ["docker"] + args
        timeout = None
        if req.timeout_seconds is not None and req.timeout_seconds > 0:
            timeout = req.timeout_seconds
        env = None
        if req.env:
            env = {**os.environ, **req.env}
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=timeout, env=env)
        except subprocess.TimeoutExpired:
            return CommandResult(
                stdout="",
                stderr="command timed out",
                exit_code=-1,
                duration_ms=_elapsed_ms(start),
            )
        except Exception as e:
            if "No such container" in str(e):
                raise NotFoundError(f"container {self._id} not found") from e
            raise ProviderError(provider="local", message=str(e)) from e
        return CommandResult(
            stdout=result.stdout.decode(errors="replace"),
            stderr=result.stderr.decode(errors="replace"),
            exit_code=result.returncode,
            duration_ms=_elapsed_ms(start),
        )

    def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        with self._handle_lock:
            self._handle_seq += 1
            n = self._handle_seq
        handle_id = f"h{time.time_ns()}-{n}"
        event = threading.Event()
        self._handles[handle_id] = event

        def _run() -> None:
            try:
                res = self.run_command(RunCommandRequest(cmd=req.cmd, cwd=req.cwd, env=req.env, user=req.user))
                self._handle_results[handle_id] = (res, None)
            except Exception as e:
                self._handle_results[handle_id] = (CommandResult(), e)
            event.set()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return n, handle_id

    def wait_for_handle(self, handle_id: str) -> CommandResult:
        event = self._handles.pop(handle_id, None)
        if event is None:
            raise NotFoundError(f"handle {handle_id} not found")
        event.wait()
        res, err = self._handle_results.pop(handle_id, (CommandResult(), None))
        if err:
            raise err
        return res

    def kill_process(self, pid: int) -> None:
        self.run_command(RunCommandRequest(cmd=f"kill -9 {pid} 2>/dev/null || true"))

    def list_processes(self) -> list[ProcessInfo]:
        raw = _docker_run(["top", self._id, "-eo", "pid,args"])
        lines = raw.decode(errors="replace").strip().split("\n")
        if len(lines) < 2:
            return []
        out: list[ProcessInfo] = []
        for line in lines[1:]:
            fields = line.split(None, 1)
            if len(fields) < 2:
                continue
            try:
                pid = int(fields[0])
            except ValueError:
                continue
            out.append(ProcessInfo(pid=pid, command=fields[1]))
        return out

    def read_file(self, path: str) -> bytes:
        path = normalize_path(path)
        cmd = ["docker", "cp", f"{self._id}:{path}", "-"]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")
            if "Could not find the file" in stderr or "No such container" in stderr:
                raise NotFoundError(f"file not found: {path}")
            raise ProviderError(provider="local", message=f"docker cp: {stderr.strip()}")
        tf = tarfile.open(fileobj=BytesIO(result.stdout), mode="r:")
        member = tf.next()
        if member is None:
            raise NotFoundError(f"file not found in archive: {path}")
        f = tf.extractfile(member)
        if f is None:
            raise NotFoundError(f"cannot extract: {path}")
        return f.read()

    def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        path = normalize_path(path)
        pp = PurePosixPath(path)
        dir_part = str(pp.parent) or "/"
        base = pp.name
        buf = BytesIO()
        with tarfile.open(fileobj=buf, mode="w:") as tw:
            info = tarfile.TarInfo(name=base)
            info.size = len(content)
            info.mode = mode if mode is not None else 0o644
            tw.addfile(info, BytesIO(content))
        cmd = ["docker", "cp", "-", f"{self._id}:{dir_part}"]
        result = subprocess.run(cmd, input=buf.getvalue(), capture_output=True)
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace").strip()
            raise ProviderError(provider="local", message=f"docker cp: {stderr}")

    def list_directory(self, path: str) -> list[FileInfo]:
        path = normalize_path(path)
        res = self.run_command(RunCommandRequest(cmd=f'ls -1b "{path}"'))
        if res.exit_code != 0:
            raise NotFoundError(f"directory not found: {path}")
        names = res.stdout.strip().split("\n")
        out: list[FileInfo] = []
        for name in names:
            name = name.strip()
            if not name:
                continue
            full = str(PurePosixPath(path) / name)
            # stat for size/mode/isdir
            stat_res = self.run_command(RunCommandRequest(cmd=f"stat -c '%s %f' \"{full}\" 2>/dev/null"))
            if stat_res.exit_code != 0:
                out.append(FileInfo(name=name, path=full))
                continue
            fields = stat_res.stdout.strip().split()
            if len(fields) < 2:
                out.append(FileInfo(name=name, path=full))
                continue
            try:
                size = int(fields[0])
            except ValueError:
                size = 0
            try:
                mode_hex = int(fields[1], 16)
            except ValueError:
                mode_hex = 0
            file_mode = mode_hex & 0o7777
            is_dir = (mode_hex & 0o40000) != 0
            out.append(FileInfo(name=name, path=full, is_dir=is_dir, size=size, mode=file_mode))
        return out

    def make_dir(self, path: str) -> None:
        path = normalize_path(path)
        self.run_command(RunCommandRequest(cmd=f'mkdir -p "{path}"'))

    def remove(self, path: str) -> None:
        path = normalize_path(path)
        self.run_command(RunCommandRequest(cmd=f'rm -rf "{path}"'))

    def exists(self, path: str) -> bool:
        path = normalize_path(path)
        res = self.run_command(RunCommandRequest(cmd=f'test -e "{path}" && echo ok'))
        return res.exit_code == 0 and "ok" in res.stdout

    def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        raise NotSupportedError("Local does not support create_pty")

    def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        raise NotSupportedError("Local does not support resize_pty")

    def kill_pty(self, pid: int) -> None:
        raise NotSupportedError("Local does not support kill_pty")

    def list_pty(self) -> list[PTYInfo]:
        raise NotSupportedError("Local does not support list_pty")


class AsyncLocalSandbox(AsyncSandbox):
    """Async wrapper around `LocalSandbox` (uses a thread pool for I/O)."""

    def __init__(self, inner: LocalSandbox) -> None:
        self._s = inner

    @property
    def id(self) -> str:
        return self._s.id

    async def info(self) -> SandboxInfo:
        return await asyncio.to_thread(self._s.info)

    async def is_running(self) -> bool:
        return await asyncio.to_thread(self._s.is_running)

    async def pause(self) -> None:
        return await asyncio.to_thread(self._s.pause)

    async def resume(self) -> None:
        return await asyncio.to_thread(self._s.resume)

    async def kill(self) -> None:
        return await asyncio.to_thread(self._s.kill)

    async def port_url(self, port: int) -> str:
        return await asyncio.to_thread(self._s.port_url, port)

    async def run_command(self, req: RunCommandRequest) -> CommandResult:
        return await asyncio.to_thread(self._s.run_command, req)

    async def start_command(self, req: StartCommandRequest) -> tuple[int, str]:
        return await asyncio.to_thread(self._s.start_command, req)

    async def wait_for_handle(self, handle_id: str) -> CommandResult:
        return await asyncio.to_thread(self._s.wait_for_handle, handle_id)

    async def kill_process(self, pid: int) -> None:
        return await asyncio.to_thread(self._s.kill_process, pid)

    async def list_processes(self) -> list[ProcessInfo]:
        return await asyncio.to_thread(self._s.list_processes)

    async def read_file(self, path: str) -> bytes:
        return await asyncio.to_thread(self._s.read_file, path)

    async def write_file(self, path: str, content: bytes, mode: int | None = None, user: str | None = None) -> None:
        return await asyncio.to_thread(self._s.write_file, path, content, mode, user)

    async def list_directory(self, path: str) -> list[FileInfo]:
        return await asyncio.to_thread(self._s.list_directory, path)

    async def make_dir(self, path: str) -> None:
        return await asyncio.to_thread(self._s.make_dir, path)

    async def remove(self, path: str) -> None:
        return await asyncio.to_thread(self._s.remove, path)

    async def exists(self, path: str) -> bool:
        return await asyncio.to_thread(self._s.exists, path)

    async def create_pty(self, req: CreatePTYRequest) -> PTYInfo:
        return await asyncio.to_thread(self._s.create_pty, req)

    async def resize_pty(self, pid: int, rows: int, cols: int) -> None:
        return await asyncio.to_thread(self._s.resize_pty, pid, rows, cols)

    async def kill_pty(self, pid: int) -> None:
        return await asyncio.to_thread(self._s.kill_pty, pid)

    async def list_pty(self) -> list[PTYInfo]:
        return await asyncio.to_thread(self._s.list_pty)


class AsyncLocalProvider(AsyncProvider):
    def __init__(self, cfg: ProviderConfig) -> None:
        self._p = LocalProvider(cfg)

    async def list_sandboxes(self, filter: ListSandboxesFilter | None = None) -> list[SandboxInfo]:
        return await asyncio.to_thread(self._p.list_sandboxes, filter)

    async def kill_sandbox(self, sandbox_id: str) -> None:
        return await asyncio.to_thread(self._p.kill_sandbox, sandbox_id)

    async def create_sandbox(self, req: CreateSandboxRequest | None = None) -> tuple[AsyncSandbox, SandboxInfo]:
        sb, info = await asyncio.to_thread(self._p.create_sandbox, req)
        assert isinstance(sb, LocalSandbox)
        return AsyncLocalSandbox(sb), info

    async def attach_sandbox(self, sandbox_id: str) -> AsyncSandbox:
        sb = await asyncio.to_thread(self._p.attach_sandbox, sandbox_id)
        assert isinstance(sb, LocalSandbox)
        return AsyncLocalSandbox(sb)

    async def close(self) -> None:
        return await asyncio.to_thread(self._p.close)


def _make_local_provider(cfg: ProviderConfig) -> Provider:
    return LocalProvider(cfg)


def _make_async_local_provider(cfg: ProviderConfig) -> AsyncProvider:
    return AsyncLocalProvider(cfg)


register_provider(ProviderName.LOCAL, _make_local_provider, _make_async_local_provider)
