# Contributing to Sandboxer

How to **set up locally**, **run checks**, and **keep the Go, Python, and TypeScript SDKs aligned**.

## Contents

1. [Expectations](#expectations)
2. [What lives where](#what-lives-where)
3. [Dev environment](#dev-environment)
4. [Repo layout](#repo-layout)
5. [Build & test](#build--test)
6. [Git hooks](#git-hooks)
7. [Code style](#code-style)
8. [Changing the public API](#changing-the-public-api)
9. [Adding a Go provider](#adding-a-go-provider)
10. [Pull requests](#pull-requests)
11. [CI](#ci)
12. [Security](#security)
13. [Releases (maintainers)](#releases-maintainers)

## Expectations

- Prefer **small PRs**.
- **Match existing patterns** unless maintainers signed off on a wider change.
- User-visible changes (env vars, providers, breaking API) belong in **[README.md](README.md)**.

## What lives where

| Area | Notes |
|------|--------|
| **Go** | Library in `sdks/go/core/`, providers in `sdks/go/providers/`. |
| **Python** | Package in `sdks/python/src/sandboxer/` (providers under `providers/`). |
| **TypeScript** | Sources in `sdks/typescript/src/` (providers under `providers/`). |
| **Contract** | There is **no** code generation step—keep request/response shapes and behavior consistent across the three SDKs when you change the surface. |

## Dev environment

**Required:** **Go** (see `sdks/go/go.mod`) and **Git**.

**Useful:** **[Bun](https://bun.sh/)** at repo root (`bun install` installs Lefthook, Prettier; workspaces include the TS SDK). **Docker** for local provider testing. **Python 3.10+** for the Python SDK or examples.

Pre-commit Python formatting expects **Ruff**. After `bun install`, `prepare` tries to add Ruff in a gitignored `.venv`. If that fails: `pip install ruff` or `uv tool install ruff`.

```bash
git clone https://github.com/hyperterse/sandboxer.git
cd sandboxer
bun install
bun run install:go

# optional — editable Python SDK + dev deps (pytest, ruff, …)
pip install -e "./sdks/python[dev]"
```

## Repo layout

```text
.
├── sdks/go/           # Go module (public API + core + providers)
├── sdks/python/       # Python package (src/sandboxer)
├── sdks/typescript/   # TypeScript package
├── examples/
├── .github/workflows/
├── docs/              # Reference docs (hand-maintained)
└── package.json       # Root scripts (`bun run …`)
```

All tasks below run from the **repo root** with **`bun run <script>`** (see **`package.json`**).

## Build & test

| Task | Command |
|------|---------|
| Go (vet, test, build) | `bun run check:go` |
| Go only | `bun run vet:go`, `bun run test:go`, `bun run build:go` |
| TypeScript SDK | `bun run install:typescript` then `bun run build:typescript` |
| Python wheel | `bun run build:python` |
| Python + TypeScript artifacts | `bun run build:sdks` |

## Git hooks

`bun install` runs Lefthook and tries to wire up Ruff. On commit: **gofmt**, **Ruff** (Python), **Prettier** (TS/JS).

```bash
bun run hooks
# or: bunx lefthook install
```

No Ruff in PATH? Run `bun run scripts/ensure-ruff.ts` or install Ruff globally.

## Code style

- **Go:** gofmt; `go vet` and tests clean.
- **Python:** Ruff format (`pyproject.toml`).
- **TypeScript:** Prettier (`.prettierrc.json`).
- Don’t commit `node_modules/`, `dist/`, or other generated output unless a workflow explicitly requires it.

## Changing the public API

1. Update **Go** types and methods in `sdks/go/core/` (and providers as needed).
2. Mirror changes in **`sdks/python/src/sandboxer/`** and **`sdks/typescript/src/`** (types, provider interfaces, implementations).
3. Run **`bun run check:go`**, **`bun run build:typescript`**, and **`bun run build:python`** (or your editor’s equivalents).
4. Update **[README.md](README.md)** and **[docs/reference-*.md](docs/)** when behavior, env vars, or provider lists change.

## Adding a Go provider

- Register in **`init()`** in **`sdks/go/providers/<name>.go`** (package **`providers`**).
- Implement **`sandboxer.Provider`** and **`sandboxer.Sandbox`**; use **`sandboxer.ErrNotSupported`** where there’s no backend equivalent.
- Add the name to **`sandboxer.ParseProviderName`** and to **Python** / **TypeScript** [`ProviderName`](sdks/python/src/sandboxer/types.py) enums/types.
- Keep unexported names in each file **unique** so files don’t clash.
- Apps and **examples/go** should blank-import **`github.com/hyperterse/sandboxer/sdks/go/providers`**.
- Prefer **HTTP** for outbound calls when it fits; keep TLS/OAuth/keys on **`sandboxer.Config`**.

## Pull requests

- [ ] `bun run check:go` passes (or `go -C sdks/go test ./...` + `go -C sdks/go vet ./...`).
- [ ] Hooks pass (or you ran the same formatters).
- [ ] Cross-language API changes: Python + TypeScript updated to match Go where applicable.
- [ ] README or this doc updated if users or contributors need to know.
- [ ] No secrets in the diff.

## CI

| Workflow | Does |
|----------|------|
| **Go** | Version guard, vet, test (integration on `main` push when secrets exist) |
| **Release tag** | Tag `v*` must match root `package.json`, `sdks/go/core/version.go`, SDK versions |
| **Publish** | Manual npm (**`@hyperterse/sandboxer`**) + PyPI (**`hyperterse-sandboxer`**) via `publish-ts.yml`, `publish-py.yml` |

## Security

- Prefer private disclosure when your policy requires it (GitHub Security Advisories, `SECURITY.md`).
- Extra care on reviews: **auth bypass**, **SSRF via BaseURL**, **secret logging**, **weak TLS defaults**.

## Releases (maintainers)

**Root `package.json`** is the version source of truth. **`bun run version:patch`** (or **`version:minor`** / **`version:major`**) runs **`scripts/version.ts`**, bumps **Go**, **TypeScript**, and **Python** manifests, then can commit, tag, and push.

```bash
bun install
bun run version:patch   # or version:minor / version:major
# or: bun run scripts/version.ts --patch [--push]
```

`--no-commit` updates version files only. After a bump: **`bun run build:typescript`**, **`bun run build:python`**, and tests if you changed APIs. **`bun run version:verify`** should stay green.

Maintain **`CHANGELOG.md`** (Keep a Changelog style works well).

Thank you for contributing.
