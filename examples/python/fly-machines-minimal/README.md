# fly-machines-minimal

Creates a Fly Machine sandbox, runs ``echo``, then destroys the machine.
Requires ``FLY_API_TOKEN`` and an app name.

## Prerequisites

- Python 3.10 or newer.
- ``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.
- Optional ``FLY_API_HOSTNAME`` (defaults in the driver).

## How to run

```bash
export FLY_API_TOKEN=your_token_here
export FLY_APP_NAME=your_app_here
PYTHONPATH=sdks/python/src python examples/python/fly-machines-minimal/main.py
```
