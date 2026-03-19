# daytona-minimal

Creates a Daytona sandbox and runs a short shell command. You need Daytona
credentials and a base URL that match your workspace.

## Prerequisites

- Python 3.10 or newer.
- Daytona token in ``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or
  ``SANDBOXER_API_KEY``.

## How to run

```bash
export DAYTONA_API_KEY=your_token_here
PYTHONPATH=sdks/python/src python examples/python/daytona-minimal/main.py
```
