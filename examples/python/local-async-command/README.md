# local-async-command

Starts a command asynchronously with ``StartCommand`` / ``start_command``, then
waits for completion with ``WaitForHandle`` / ``wait_for_handle``. Use this
pattern for long-running tasks without blocking the initial API call.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-async-command/main.py
```
