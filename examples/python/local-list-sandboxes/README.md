# local-list-sandboxes

Creates a sandbox, then calls ``ListSandboxes`` / ``list_sandboxes`` to list
sandbox records the provider sees. On ``local``, containers are filtered by
Sandboxer labels.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-list-sandboxes/main.py
```
