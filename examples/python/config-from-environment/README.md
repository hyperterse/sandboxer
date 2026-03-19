# config-from-environment

Builds an E2B client from ``E2B_API_KEY``, optional ``E2B_API_BASE``, and
optional ``E2B_DEFAULT_TIMEOUT_MS`` for ``default_timeout_ms``, then creates a
sandbox and runs ``echo``. This does not read ``SANDBOXER_PROVIDER``; it always
uses E2B.

## Prerequisites

- Python 3.10 or newer; ``E2B_API_KEY``.
- Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.

## How to run

```bash
export E2B_API_KEY=your_key_here
PYTHONPATH=sdks/python/src python examples/python/config-from-environment/main.py
```
