# context-timeout

Runs a command that would take longer than the allowed timeout (Go uses a short
context deadline; Python and TypeScript use ``timeout_seconds`` /
``timeoutSeconds`` on the command). Shows how timeouts surface as errors.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/context-timeout/main.py
```
