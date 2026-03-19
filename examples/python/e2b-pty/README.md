# e2b-pty

Attempts to open a PTY session on E2B. Depending on the driver version, this may
still return ``ErrNotSupported`` / ``NotSupportedError``; the sample prints a
clear message when PTY is not wired for that backend.

## Prerequisites

- Python 3.10 or newer; ``E2B_API_KEY``.

## How to run

```bash
export E2B_API_KEY=your_key_here
PYTHONPATH=sdks/python/src python examples/python/e2b-pty/main.py
```
