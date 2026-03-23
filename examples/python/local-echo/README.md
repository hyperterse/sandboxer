# local-echo

Creates a sandbox with the ``local`` provider (Docker on your machine), runs one
``echo`` command, then deletes the sandbox. This is the smallest end-to-end
path: no cloud API key, only the Docker CLI talking to your container engine.
Use it to confirm Sandboxer can provision and tear down workloads.

## Prerequisites

- Python 3.10 or newer.
- Docker installed and the daemon running; ``docker info`` must succeed.
- The script prepends ``sdks/python/src`` to ``PYTHONPATH`` so you can run from
  a clone without installing ``hyperterse-sandboxer`` from PyPI.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-echo/main.py
```
