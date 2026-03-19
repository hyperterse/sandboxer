# local-pause-resume

Pauses and resumes the container using ``Pause`` / ``pause`` and ``Resume`` /
``resume`` (Docker pause and unpause). Not every hosted provider supports this;
the local driver maps it to ``docker pause`` and ``docker unpause``.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-pause-resume
```
