# local-kill-by-id

Creates a sandbox, then destroys it with ``KillSandbox`` / ``kill_sandbox`` on
the client using the provider id without calling ``Kill`` on the handle first.
Shows teardown when you only store the id string.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-kill-by-id/main.py
```
