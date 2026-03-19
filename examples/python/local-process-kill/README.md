# local-process-kill

Starts a long-running command, finds a process in the listing, and sends
``KillProcess`` / ``kill_process`` to stop it. Demonstrates process control when
you cannot rely on the shell alone.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-process-kill/main.py
```
