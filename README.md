<div align="center">

<img src="assets/og.png" alt="Sandboxer - Unified Sandbox Client" />

# Sandboxer

**One way to work with remote sandboxes** from your application. Pick a host
(E2B, Daytona, Blaxel, Runloop, Fly Machines, or **Docker on your machine**),
and use the same mental model in **Go**, **Python**, and **TypeScript**: open a
sandbox, run commands, read and write files, and tear down when you are done.

[E2B](https://e2b.dev) · [Daytona](https://daytona.io) · [Blaxel](https://blaxel.ai) · [Runloop](https://runloop.ai) · [Fly Machines](https://fly.io/products/machines)

</div>

## Overview

Sandboxer is a family of client libraries. Each library talks **directly** to
the provider you configure. There is no separate Sandboxer service in the
request path: your credentials go to the vendor API (or to the `docker` CLI for
local sandboxes).

Use it when you are building **automation, agents, CI, or internal tools** that
need isolated environments without maintaining one integration per vendor.

## Why Sandboxer

- 🧠 **One mental model** — Create sandboxes, run commands, and manage files the
  same way in Go, Python, and TypeScript.
- 🔌 **Many hosts, one surface** — Switch between E2B, Daytona, Blaxel, Runloop,
  Fly Machines, or local Docker without rewriting your integration.
- 🛤️ **No extra hop** — Your app talks straight to each provider; Sandboxer is
  not a hosted proxy in the middle.
- 🔑 **Your secrets, your boundary** — API keys and tokens go to the vendor (or
  your machine for local runs), not through a separate Sandboxer service.
- 📚 **Typed SDKs and examples** — References and runnable examples per
  language so you can ship quickly and debug with confidence.

## Documentation

| Language   | Reference                                 | Examples                                    |
| ---------- | ----------------------------------------- | ------------------------------------------- |
| Go         | [Reference](docs/reference-go.md)         | [examples/go](examples/go/)                 |
| Python     | [Reference](docs/reference-python.md)     | [examples/python](examples/python/)         |
| TypeScript | [Reference](docs/reference-typescript.md) | [examples/typescript](examples/typescript/) |

## Install

```bash
go get github.com/hyperterse/sandboxer/sdks/go   # version: see sdks/go/go.mod
pip install sandboxer                            # Python 3.10+
npm install sandboxer                            # when published; see sdks/typescript/README.md
```

From a clone of this repository: run `bun install`, `bun run install:python`,
and `bun run build:typescript`, or point your Go module at `sdks/go` (see
[examples/go/go.mod](examples/go/go.mod) for a `replace` example). Scripts are
listed in the root [`package.json`](package.json).

## Providers: base URL and credentials

Set **`base_url`** / **`baseUrl`** and the API key or token your provider
expects when you construct the client. Typical origins:

| Provider     | Typical base URL              | Notes                                                                                  |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| E2B          | `https://api.e2b.app`         | API key (header handled in the driver)                                                 |
| Daytona      | `https://app.daytona.io/api`  | Bearer token                                                                           |
| Blaxel       | `https://api.blaxel.ai/v0`    | Bearer or API key; optional `X-Blaxel-Workspace` (`BL_WORKSPACE` / `BLAXEL_WORKSPACE`) |
| Runloop      | `https://api.runloop.ai/v1`   | Bearer                                                                                 |
| Fly Machines | `https://api.machines.dev/v1` | Bearer (`FLY_API_TOKEN`)                                                               |
| local        | _not used_                    | Host `docker` CLI; no remote API key                                                   |

Exact environment variables and headers live in each provider under
`sdks/*/providers/`. Treat API keys like any other secret: store them in your
secret manager or environment, not in source control.

## Quick start

Copy-paste examples and full APIs live in each language reference and under
`examples/` for [Go](examples/go/), [Python](examples/python/), and
[TypeScript](examples/typescript/).

## Troubleshooting

| What you see                            | What to try                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Local sandbox does not start            | Confirm `docker info` succeeds on the host.                                                                                  |
| 401 or 403 from the host                | Match API key, token, and base URL to that vendor’s documentation.                                                           |
| Python `ModuleNotFoundError: sandboxer` | Run `pip install -e ./sdks/python` or `pip install sandboxer`.                                                               |
| TypeScript import errors                | Build `sdks/typescript` or install the package name from `sdks/typescript/package.json`.                                     |

Local development and CI: [CONTRIBUTING.md](CONTRIBUTING.md).

---

[Contributing](CONTRIBUTING.md) · [Issues](https://github.com/hyperterse/sandboxer/issues)
