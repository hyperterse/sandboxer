# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-24

### Added

- First release of **Sandboxer**: Go, Python, and TypeScript SDKs for a shared
  sandbox API (create sandboxes, run commands, read/write files, teardown).
- Provider integrations for **E2B**, **Daytona**, **Blaxel**, **Runloop**,
  **Fly Machines**, and **local Docker** (direct to each vendor; no Sandboxer
  proxy in the request path).
- Language references and runnable **examples** per SDK (`docs/reference-*.md`,
  `examples/go`, `examples/python`, `examples/typescript`).
- Root **versioning workflow** (`scripts/version.ts`, `bun run version:*`) to
  keep Go, Python, and TypeScript package versions aligned.

### Changed

- **Documentation**: README layout (header banner, OG image), npm package
  **keywords**, and repository **metadata** for discovery.

[0.1.0]: https://github.com/hyperterse/sandboxer/releases/tag/v0.1.0
