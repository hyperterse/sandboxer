# local-files

Writes a small file inside the sandbox with ``WriteFile`` / ``write_file``, then
reads it back with ``ReadFile`` / ``read_file``. Shows how binary-safe payloads
move through the SDK on the local Docker backend.

## Prerequisites

- Python 3.10 or newer and Docker.
- Same ``PYTHONPATH`` pattern as other Python examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-files/main.py
```
