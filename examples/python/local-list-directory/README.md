# local-list-directory

Lists directory entries under a path inside the container using
``ListDirectory`` / ``list_directory``. Useful when you build tools that inspect
workspace outputs or cache directories.

## Prerequisites

- Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/local-list-directory/main.py
```
