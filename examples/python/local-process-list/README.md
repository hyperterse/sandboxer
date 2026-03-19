# local-process-list

Calls ``ListProcesses`` / ``list_processes`` to inspect processes visible inside
the container. Useful for debugging what is still running after you start
background work.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-process-list/main.py
```
