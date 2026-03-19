# Python API reference

This page documents the **`sandboxer`** package
([`sdks/python/src/sandboxer`](../sdks/python/src/sandboxer/)).

You pick a **provider** name (for example `e2b` or `local`). The client talks
to that host over **HTTPS** with the vendor’s authentication, or runs the
**`docker`** CLI when you use **`local`**. There is no separate Sandboxer
server. **Python 3.10+** is required ([`pyproject.toml`](../sdks/python/pyproject.toml)).

```python
from sandboxer import Sandboxer, AsyncSandboxer, RunCommandRequest

client = Sandboxer(
    "e2b",
    {
        "api_key": "...",
        "base_url": "https://api.e2b.app",
    },
)
sb, info = client.create_sandbox()
try:
    out = sb.run_command(RunCommandRequest(cmd="echo hello"))
    print(out.stdout)
finally:
    sb.kill()
    client.close()
```

Use **`AsyncSandboxer`** for async code. Method names match the synchronous
client, using **`async` / `await`**.

## Entry points

| Module | Role |
|--------|------|
| [`__init__.py`](../sdks/python/src/sandboxer/__init__.py) | **`Sandboxer`**, **`AsyncSandboxer`** |
| [`provider.py`](../sdks/python/src/sandboxer/provider.py) | **`Provider`**, **`Sandbox`**, **`AsyncProvider`**, **`AsyncSandbox`** protocols |
| [`types.py`](../sdks/python/src/sandboxer/types.py) | **`ProviderName`**, requests (`CreateSandboxRequest`, `RunCommandRequest`, …), responses |
| [`config.py`](../sdks/python/src/sandboxer/config.py) | **`ProviderConfig`** (`api_key`, `base_url`, `default_timeout_ms`, extras) |
| [`errors.py`](../sdks/python/src/sandboxer/errors.py) | Typed errors (`NotFoundError`, `ProviderError`, …) |
| [`registry.py`](../sdks/python/src/sandboxer/registry.py) | **`register_provider`**, **`resolve_provider`** |

Provider implementations live under [`sdks/python/src/sandboxer/providers/`](../sdks/python/src/sandboxer/providers/).

## Provider names

[`ProviderName`](../sdks/python/src/sandboxer/types.py): **`e2b`**, **`daytona`**, **`blaxel`**, **`runloop`**, **`fly-machines`**, **`local`**.

## `Sandboxer` / `AsyncSandboxer`

| Method | Description |
|--------|-------------|
| `create_sandbox(req?)` | Returns **`(Sandbox, SandboxInfo)`** |
| `attach_sandbox(sandbox_id)` | **`Sandbox`** for an existing id |
| `list_sandboxes(filter?)` | List **`SandboxInfo`** |
| `kill_sandbox(sandbox_id)` | Teardown by id |
| `close()` | Release provider resources |

## `Sandbox` / `AsyncSandbox`

Lifecycle: **`info`**, **`is_running`**, **`pause`**, **`resume`**, **`kill`**, **`port_url`**.

Commands: **`run_command`**, **`start_command`**, **`wait_for_handle`**, **`kill_process`**, **`list_processes`**.

Filesystem: **`read_file`**, **`write_file`**, **`list_directory`**, **`make_dir`**, **`remove`**, **`exists`**.

PTY: **`create_pty`**, **`resize_pty`**, **`kill_pty`**, **`list_pty`**.

## Configuration

Pass a dict or **`ProviderConfig`**. Typical keys are **`api_key`**,
**`base_url`**, **`default_timeout_ms`**. Some drivers accept extra keys; see
the matching module under **`providers/`**.

## Errors

Subclasses of **`SandboxerError`** in
[`errors.py`](../sdks/python/src/sandboxer/errors.py); use them like any other
Python exception.
