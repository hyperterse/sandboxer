# e2b-files

Writes and reads a file in an E2B sandbox over the provider API. Compare with
``local-files`` to see the same file API on a hosted backend.

## Prerequisites

- Python 3.10 or newer; ``E2B_API_KEY``; optional ``E2B_API_BASE``.

## How to run

```bash
export E2B_API_KEY=your_key_here
PYTHONPATH=sdks/python/src python examples/python/e2b-files/main.py
```
