# local-attach

Creates a sandbox, then calls ``AttachSandbox`` / ``attach_sandbox`` with the
same id to obtain a new handle. Use this when your process restarts but you
still know the sandbox id.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-attach/main.py
```
