# local-port-url

Calls ``PortURL`` / ``portUrl`` to resolve a preview or tunnel URL for a port
inside the sandbox. The default local container does not publish host ports, so
you often see ``ErrNotSupported`` or ``NotSupportedError`` until you map ports
in your workflow.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-port-url/main.py
```
