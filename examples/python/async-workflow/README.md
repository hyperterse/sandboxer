# async-workflow

Uses ``AsyncSandboxer`` with the ``local`` provider to run commands with
``await`` on a local sandbox.

## Prerequisites

- Python 3.10 or newer and Docker.
- Requires async support for ``local`` in the Python SDK (see
  ``providers/local.py``).

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/async-workflow/main.py
```
