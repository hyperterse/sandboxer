# local-list-directory

Lists directory entries under a path inside the container using
``ListDirectory`` / ``list_directory``. Useful when you build tools that inspect
workspace outputs or cache directories.

## Prerequisites

- Go toolchain and Docker; run from ``examples/go``.

## How to run

```bash
cd examples/go
go run ./local-list-directory
```
