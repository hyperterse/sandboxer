# local-pause-resume

Pauses and resumes the container using ``Pause`` / ``pause`` and ``Resume`` /
``resume`` (Docker pause and unpause). Not every hosted provider supports this;
the local driver maps it to ``docker pause`` and ``docker unpause``.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-pause-resume/main.py
```
