# blaxel-minimal

Creates a Blaxel sandbox through the control plane (default
``https://api.blaxel.ai/v0``), prints its id, then deletes it. Uses the Blaxel
API key as a Bearer token; optional workspace via ``BL_WORKSPACE`` /
``BLAXEL_WORKSPACE`` (Python: ``extra.workspace``). Pause, resume, and PTY are
not supported by this provider.

## Prerequisites

- Python 3.10 or newer.
- ``BLAXEL_API_KEY``, ``BL_API_KEY``, or ``SANDBOXER_API_KEY``; optional
  ``BLAXEL_API_BASE``.
- Optional ``BL_WORKSPACE`` / ``BLAXEL_WORKSPACE``.

## How to run

```bash
export BLAXEL_API_KEY=your_key_here
PYTHONPATH=sdks/python/src python examples/python/blaxel-minimal/main.py
```
