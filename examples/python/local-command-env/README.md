# local-command-env

Runs a command with ``Env`` / ``env`` on ``RunCommand`` / ``run_command`` (and
optional sandbox env on create where the sample sets it). Shows how to pass
environment variables into process execution inside the sandbox.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-command-env/main.py
```
