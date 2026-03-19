# e2b-echo

Creates a sandbox on E2B and runs ``echo``. This is the smallest hosted flow:
you need an E2B API key and network access to the E2B API.

## Prerequisites

- Python 3.10 or newer.
- An E2B API key in ``E2B_API_KEY`` (or ``SANDBOXER_API_KEY`` if your script
  mirrors other samples).
- Optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
PYTHONPATH=sdks/python/src python examples/python/e2b-echo/main.py
```
