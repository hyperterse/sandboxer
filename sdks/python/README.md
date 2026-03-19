# Sandboxer (Python)

Python client for Sandboxer. You choose a **provider** (a sandbox host or
local Docker); the library calls that backend directly. There is no Sandboxer
cloud service between your code and the host.

## Install

```bash
pip install sandboxer
```

From a clone of the repository:

```bash
pip install -e ./sdks/python
# optional development dependencies
pip install -e "./sdks/python[dev]"
```

## Usage

```python
from sandboxer import Sandboxer, RunCommandRequest

client = Sandboxer("e2b", {"api_key": "...", "base_url": "https://api.e2b.app"})
sb, info = client.create_sandbox()
try:
    print(sb.run_command(RunCommandRequest(cmd="echo hi")).stdout)
finally:
    sb.kill()
    client.close()
```

Full API tables and types: [Python API reference](../../docs/reference-python.md).

## Layout

- Package code: [`src/sandboxer/`](src/sandboxer/)
- Provider drivers: [`src/sandboxer/providers/`](src/sandboxer/providers/)
