# handle-unsupported

Calls ``CreatePTY`` / ``create_pty`` on a local sandbox. The local Docker driver
returns ``ErrNotSupported`` / ``NotSupportedError`` for PTY, so the sample shows
how to branch on that error instead of crashing.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/handle-unsupported/main.py
```
