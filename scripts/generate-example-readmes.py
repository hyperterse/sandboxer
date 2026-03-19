#!/usr/bin/env python3
"""Regenerate README.md files under examples/{go,python,typescript}/<name>/."""

from __future__ import annotations

import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"

WIDTH = 80


def wrap(s: str) -> str:
    s = s.strip()
    if not s:
        return ""
    parts = []
    for para in s.split("\n\n"):
        parts.append(textwrap.fill(para.strip(), width=WIDTH))
    return "\n\n".join(parts)


def bullets(items: list[str]) -> str:
    out: list[str] = []
    for x in items:
        out.append(
            textwrap.fill(
                x,
                width=WIDTH,
                initial_indent="- ",
                subsequent_indent="  ",
            )
        )
    return "\n".join(out)


def readme(
    title: str,
    intro: str,
    prereq: list[str],
    run: str,
) -> str:
    body = [
        f"# {title}",
        "",
        wrap(intro),
        "",
        "## Prerequisites",
        "",
        bullets(prereq),
        "",
        "## How to run",
        "",
        "```bash",
        run.rstrip(),
        "```",
        "",
    ]
    return "\n".join(body)


def main() -> None:
    data: dict[str, dict] = {
        "local-echo": {
            "intro": (
                "Creates a sandbox with the ``local`` provider (Docker on your machine), "
                "runs one ``echo`` command, then deletes the sandbox. This is the smallest "
                "end-to-end path: no cloud API key, only the Docker CLI talking to your "
                "container engine. Use it to confirm Sandboxer can provision and tear "
                "down workloads."
            ),
            "prereq_go": [
                "Go toolchain matching ``sdks/go/go.mod``.",
                "Docker installed and the daemon running; ``docker info`` must succeed.",
                "Commands below assume the ``examples/go`` module (``go.mod`` uses a "
                "``replace`` to the SDK in this repo).",
            ],
            "prereq_py": [
                "Python 3.10 or newer.",
                "Docker installed and the daemon running; ``docker info`` must succeed.",
                "The script prepends ``sdks/python/src`` to ``PYTHONPATH`` so you can run "
                "from a clone without installing the package from PyPI.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer with ``npx``, or Bun to run TypeScript directly.",
                "Docker installed and the daemon running; ``docker info`` must succeed.",
                "The script imports the SDK from ``sdks/typescript/src``; build the SDK "
                "if you prefer importing from ``dist``.",
            ],
            "run_go": "cd examples/go\ngo run ./local-echo",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-echo/main.py",
            "run_ts": "npx tsx examples/typescript/local-echo/index.ts",
        },
        "local-files": {
            "intro": (
                "Writes a small file inside the sandbox with ``WriteFile`` / "
                "``write_file``, then reads it back with ``ReadFile`` / ``read_file``. "
                "Shows how binary-safe payloads move through the SDK on the local "
                "Docker backend."
            ),
            "prereq_go": [
                "Go toolchain matching ``sdks/go/go.mod``.",
                "Docker installed and the daemon running.",
                "Run from the ``examples/go`` module as described for ``local-echo``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker.",
                "Same ``PYTHONPATH`` pattern as other Python examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
                "Same SDK import path as other TypeScript examples.",
            ],
            "run_go": "cd examples/go\ngo run ./local-files",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-files/main.py",
            "run_ts": "npx tsx examples/typescript/local-files/index.ts",
        },
        "local-list-directory": {
            "intro": (
                "Lists directory entries under a path inside the container using "
                "``ListDirectory`` / ``list_directory``. Useful when you build tools "
                "that inspect workspace outputs or cache directories."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-list-directory",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-list-directory/main.py",
            "run_ts": "npx tsx examples/typescript/local-list-directory/index.ts",
        },
        "local-path-ops": {
            "intro": (
                "Creates a directory, checks that a path exists, "
                "and removes a path using ``MakeDir`` / ``make_dir``, ``Exists`` / "
                "``exists``, and ``Remove`` / ``remove``. This mirrors common file "
                "tree setup before running commands."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-path-ops",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-path-ops/main.py",
            "run_ts": "npx tsx examples/typescript/local-path-ops/index.ts",
        },
        "local-command-env": {
            "intro": (
                "Runs a command with ``Env`` / ``env`` on ``RunCommand`` / "
                "``run_command`` (and optional sandbox env on create where the sample "
                "sets it). Shows how to pass environment variables into process "
                "execution inside the sandbox."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-command-env",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-command-env/main.py",
            "run_ts": "npx tsx examples/typescript/local-command-env/index.ts",
        },
        "local-async-command": {
            "intro": (
                "Starts a command asynchronously with ``StartCommand`` / "
                "``start_command``, then waits for completion with ``WaitForHandle`` / "
                "``wait_for_handle``. Use this pattern for long-running tasks "
                "without blocking the initial API call."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-async-command",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-async-command/main.py",
            "run_ts": "npx tsx examples/typescript/local-async-command/index.ts",
        },
        "local-sandbox-info": {
            "intro": (
                "Reads sandbox metadata from the create response and again via "
                "``Info`` / ``info``. Helps you confirm identifiers and status "
                "while debugging lifecycle issues."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-sandbox-info",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-sandbox-info/main.py",
            "run_ts": "npx tsx examples/typescript/local-sandbox-info/index.ts",
        },
        "local-process-list": {
            "intro": (
                "Calls ``ListProcesses`` / ``list_processes`` to inspect processes "
                "visible inside the container. Useful for debugging what is still "
                "running after you start background work."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-process-list",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-process-list/main.py",
            "run_ts": "npx tsx examples/typescript/local-process-list/index.ts",
        },
        "local-process-kill": {
            "intro": (
                "Starts a long-running command, finds a process in the listing, "
                "and sends ``KillProcess`` / ``kill_process`` to stop it. "
                "Demonstrates process control when you cannot rely on the shell "
                "alone."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-process-kill",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-process-kill/main.py",
            "run_ts": "npx tsx examples/typescript/local-process-kill/index.ts",
        },
        "local-pause-resume": {
            "intro": (
                "Pauses and resumes the container using ``Pause`` / ``pause`` and "
                "``Resume`` / ``resume`` (Docker pause and unpause). Not every "
                "hosted provider supports this; the local driver maps it to "
                "``docker pause`` and ``docker unpause``."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-pause-resume",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-pause-resume/main.py",
            "run_ts": "npx tsx examples/typescript/local-pause-resume/index.ts",
        },
        "local-list-sandboxes": {
            "intro": (
                "Creates a sandbox, then calls ``ListSandboxes`` / ``list_sandboxes`` "
                "to list sandbox records the provider sees. On ``local``, "
                "containers are filtered by Sandboxer labels."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-list-sandboxes",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-list-sandboxes/main.py",
            "run_ts": "npx tsx examples/typescript/local-list-sandboxes/index.ts",
        },
        "local-attach": {
            "intro": (
                "Creates a sandbox, then calls ``AttachSandbox`` / ``attach_sandbox`` "
                "with the same id to obtain a new handle. Use this when your process "
                "restarts but you still know the sandbox id."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-attach",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-attach/main.py",
            "run_ts": "npx tsx examples/typescript/local-attach/index.ts",
        },
        "local-kill-by-id": {
            "intro": (
                "Creates a sandbox, then destroys it with ``KillSandbox`` / "
                "``kill_sandbox`` on the client using the provider id without "
                "calling ``Kill`` on the handle first. "
                "Shows teardown when you only store the id string."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-kill-by-id",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-kill-by-id/main.py",
            "run_ts": "npx tsx examples/typescript/local-kill-by-id/index.ts",
        },
        "local-create-options": {
            "intro": (
                "Passes optional create fields such as template image, metadata, "
                "and environment variables. Adjusts ``CreateSandboxRequest`` / "
                "``createSandbox`` to show how you label and configure the "
                "machine before commands run."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-create-options",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-create-options/main.py",
            "run_ts": "npx tsx examples/typescript/local-create-options/index.ts",
        },
        "local-port-url": {
            "intro": (
                "Calls ``PortURL`` / ``portUrl`` to resolve a preview or tunnel URL "
                "for a port inside the sandbox. The default local container does "
                "not publish host ports, so you often see ``ErrNotSupported`` or "
                "``NotSupportedError`` until you map ports in your workflow."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./local-port-url",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/local-port-url/main.py",
            "run_ts": "npx tsx examples/typescript/local-port-url/index.ts",
        },
        "e2b-echo": {
            "intro": (
                "Creates a sandbox on E2B and runs ``echo``. This is the smallest "
                "hosted flow: you need an E2B API key and network access to the "
                "E2B API."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.",
                "Optional ``E2B_API_BASE`` if you use a non-default API origin.",
            ],
            "prereq_py": [
                "Python 3.10 or newer.",
                "An E2B API key in ``E2B_API_KEY`` (or ``SANDBOXER_API_KEY`` if your "
                "script mirrors other samples).",
                "Optional ``E2B_API_BASE``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun).",
                "An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.",
                "Optional ``E2B_API_BASE``.",
            ],
            "run_go": (
                "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-echo"
            ),
            "run_py": (
                "export E2B_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/e2b-echo/main.py"
            ),
            "run_ts": (
                "export E2B_API_KEY=your_key_here\n"
                "npx tsx examples/typescript/e2b-echo/index.ts"
            ),
        },
        "e2b-files": {
            "intro": (
                "Writes and reads a file in an E2B sandbox over the provider API. "
                "Compare with ``local-files`` to see the same file API on a "
                "hosted backend."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer; ``E2B_API_KEY``; optional ``E2B_API_BASE``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun); ``E2B_API_KEY``; optional ``E2B_API_BASE``.",
            ],
            "run_go": (
                "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-files"
            ),
            "run_py": (
                "export E2B_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/e2b-files/main.py"
            ),
            "run_ts": (
                "export E2B_API_KEY=your_key_here\n"
                "npx tsx examples/typescript/e2b-files/index.ts"
            ),
        },
        "daytona-minimal": {
            "intro": (
                "Creates a Daytona sandbox and runs a short shell command. "
                "You need Daytona credentials and a base URL that match your "
                "workspace."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or ``SANDBOXER_API_KEY``.",
                "Optional ``DAYTONA_API_BASE`` or ``DAYTONA_TOOLBOX_BASE_URL`` per your driver.",
            ],
            "prereq_py": [
                "Python 3.10 or newer.",
                "Daytona token in ``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or "
                "``SANDBOXER_API_KEY``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun).",
                "Daytona credentials as in the TypeScript sample (see source file).",
            ],
            "run_go": (
                "export DAYTONA_API_KEY=your_token_here\n"
                "cd examples/go\n"
                "go run ./daytona-minimal"
            ),
            "run_py": (
                "export DAYTONA_API_KEY=your_token_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/daytona-minimal/main.py"
            ),
            "run_ts": (
                "export DAYTONA_API_KEY=your_token_here\n"
                "npx tsx examples/typescript/daytona-minimal/index.ts"
            ),
        },
        "runloop-minimal": {
            "intro": (
                "Creates a Runloop sandbox and runs ``echo``. Validates your "
                "Runloop API key and base URL configuration."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``RUNLOOP_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``RUNLOOP_API_BASE``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer; ``RUNLOOP_API_KEY``; optional ``RUNLOOP_API_BASE``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun); ``RUNLOOP_API_KEY``; optional base URL.",
            ],
            "run_go": (
                "export RUNLOOP_API_KEY=your_key_here\n"
                "cd examples/go\n"
                "go run ./runloop-minimal"
            ),
            "run_py": (
                "export RUNLOOP_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/runloop-minimal/main.py"
            ),
            "run_ts": (
                "export RUNLOOP_API_KEY=your_key_here\n"
                "npx tsx examples/typescript/runloop-minimal/index.ts"
            ),
        },
        "blaxel-minimal": {
            "intro": (
                "Attempts to create a Blaxel sandbox. The current Blaxel driver "
                "in this repo is largely stubbed and often returns "
                "``ErrNotSupported`` / ``NotSupportedError`` so you can see how "
                "to handle unsupported operations in client code."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``BLAXEL_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``BLAXEL_API_BASE``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer; ``BLAXEL_API_KEY``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun); ``BLAXEL_API_KEY``.",
            ],
            "run_go": (
                "export BLAXEL_API_KEY=your_key_here\n"
                "cd examples/go\n"
                "go run ./blaxel-minimal"
            ),
            "run_py": (
                "export BLAXEL_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/blaxel-minimal/main.py"
            ),
            "run_ts": (
                "export BLAXEL_API_KEY=your_key_here\n"
                "npx tsx examples/typescript/blaxel-minimal/index.ts"
            ),
        },
        "fly-machines-minimal": {
            "intro_go": (
                "Creates a Fly Machine in your app, runs a command over the driver "
                "exec path, then destroys the machine. Requires a Fly API token "
                "and app name."
            ),
            "intro_py": (
                "Creates a Fly Machine sandbox, runs ``echo``, then "
                "destroys the machine. Requires ``FLY_API_TOKEN`` and an app name."
            ),
            "intro_ts": (
                "Lists Fly Machines for your app using ``listSandboxes`` with a "
                "``limit``. It does not create a sandbox in this TypeScript "
                "sample; compare with the Go and Python examples that provision "
                "a machine."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``FLY_API_TOKEN`` or ``SANDBOXER_API_KEY``.",
                "``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
                "Optional ``FLY_API_HOSTNAME`` and ``FLY_REGION`` for API routing.",
            ],
            "prereq_py": [
                "Python 3.10 or newer.",
                "``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
                "Optional ``FLY_API_HOSTNAME`` (defaults in the driver).",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun).",
                "``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
                "This sample only lists machines; it does not create one.",
            ],
            "run_go": (
                "export FLY_API_TOKEN=your_token_here\n"
                "export FLY_APP_NAME=your_app_here\n"
                "cd examples/go\n"
                "go run ./fly-machines-minimal"
            ),
            "run_py": (
                "export FLY_API_TOKEN=your_token_here\n"
                "export FLY_APP_NAME=your_app_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/fly-machines-minimal/main.py"
            ),
            "run_ts": (
                "export FLY_API_TOKEN=your_token_here\n"
                "export FLY_APP_NAME=your_app_here\n"
                "npx tsx examples/typescript/fly-machines-minimal/index.ts"
            ),
        },
        "config-from-environment": {
            "intro_go": (
                "Creates an E2B sandbox using configuration read from the "
                "environment: ``E2B_API_KEY``, optional ``E2B_API_BASE``, and "
                "optional ``E2B_DEFAULT_TIMEOUT_MS`` for the HTTP client default "
                "timeout. Matches the spirit of the Python sample in this "
                "repository."
            ),
            "intro_py": (
                "Builds an E2B client from ``E2B_API_KEY``, optional ``E2B_API_BASE``, "
                "and optional ``E2B_DEFAULT_TIMEOUT_MS`` for ``default_timeout_ms``, "
                "then creates a sandbox and runs ``echo``. "
                "This does not read ``SANDBOXER_PROVIDER``; it always uses E2B."
            ),
            "intro_ts": (
                "Builds a ``Sandboxer`` from ``SANDBOXER_PROVIDER`` (default "
                "``local``) plus optional ``SANDBOXER_API_KEY`` and "
                "``SANDBOXER_BASE_URL``. Key and base URL fallbacks per provider "
                "are in ``index.ts``. This sample only calls ``listSandboxes``; "
                "it does not create a sandbox. "
                "For ``blaxel``, it catches ``NotSupportedError`` when listing is "
                "stubbed."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``E2B_API_KEY`` set.",
                "Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer; ``E2B_API_KEY``.",
                "Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun).",
                "For ``local``, no API key. For ``e2b``, set ``E2B_API_KEY`` or "
                "``SANDBOXER_API_KEY`` and optional ``E2B_API_BASE``.",
                "Other providers (Daytona, Runloop, Fly, Blaxel) need their "
                "respective keys as implemented in the source file.",
            ],
            "run_go": (
                "export E2B_API_KEY=your_key_here\n"
                "cd examples/go\n"
                "go run ./config-from-environment"
            ),
            "run_py": (
                "export E2B_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/config-from-environment/main.py"
            ),
            "run_ts": (
                "export SANDBOXER_PROVIDER=local\n"
                "npx tsx examples/typescript/config-from-environment/index.ts"
            ),
        },
        "handle-unsupported": {
            "intro": (
                "Calls ``CreatePTY`` / ``create_pty`` on a local sandbox. "
                "The local Docker driver returns ``ErrNotSupported`` / "
                "``NotSupportedError`` for PTY, so the sample shows how to branch "
                "on that error instead of crashing."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./handle-unsupported",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/handle-unsupported/main.py",
            "run_ts": "npx tsx examples/typescript/handle-unsupported/index.ts",
        },
        "context-timeout": {
            "intro": (
                "Runs a command that would take longer than the allowed timeout "
                "(Go uses a short context deadline; Python and TypeScript use "
                "``timeout_seconds`` / ``timeoutSeconds`` on the command). "
                "Shows how timeouts surface as errors."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./context-timeout",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/context-timeout/main.py",
            "run_ts": "npx tsx examples/typescript/context-timeout/index.ts",
        },
        "e2b-pty": {
            "intro": (
                "Attempts to open a PTY session on E2B. Depending on the driver "
                "version, this may still return ``ErrNotSupported`` / "
                "``NotSupportedError``; the sample prints a clear message when "
                "PTY is not wired for that backend."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer; ``E2B_API_KEY``.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun); ``E2B_API_KEY``.",
            ],
            "run_go": (
                "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-pty"
            ),
            "run_py": (
                "export E2B_API_KEY=your_key_here\n"
                "PYTHONPATH=sdks/python/src python examples/python/e2b-pty/main.py"
            ),
            "run_ts": (
                "export E2B_API_KEY=your_key_here\n"
                "npx tsx examples/typescript/e2b-pty/index.ts"
            ),
        },
        "async-workflow": {
            "intro_go": (
                "Chains two asynchronous command steps via ``StartCommand`` and "
                "``WaitForHandle`` on a local sandbox."
            ),
            "intro_py": (
                "Uses ``AsyncSandboxer`` with the ``local`` provider to run "
                "commands with ``await`` on a local sandbox."
            ),
            "intro_ts": (
                "Uses ``Promise.all`` and sequential ``await`` to run multiple "
                "commands in one script; demonstrates async orchestration in "
                "JavaScript."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker.",
                "Requires async support for ``local`` in the Python SDK (see "
                "``providers/local.py``).",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./async-workflow",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/async-workflow/main.py",
            "run_ts": "npx tsx examples/typescript/async-workflow/index.ts",
        },
        "list-sandboxes-filter": {
            "intro": (
                "Calls ``ListSandboxes`` / ``list_sandboxes`` with a ``limit`` "
                "and optional metadata filter so you can narrow results when "
                "many sandboxes exist."
            ),
            "prereq_go": [
                "Go toolchain and Docker; run from ``examples/go``.",
            ],
            "prereq_py": [
                "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun) and Docker.",
            ],
            "run_go": "cd examples/go\ngo run ./list-sandboxes-filter",
            "run_py": "PYTHONPATH=sdks/python/src python examples/python/list-sandboxes-filter/main.py",
            "run_ts": "npx tsx examples/typescript/list-sandboxes-filter/index.ts",
        },
        "swap-provider-cli": {
            "intro": (
                "Selects a provider name from the first command-line argument "
                "(or defaults to ``local``), constructs a client, and calls "
                "``list_sandboxes``. Use this to smoke-test credentials and "
                "provider wiring without creating a sandbox."
            ),
            "prereq_go": [
                "Go toolchain; run from ``examples/go``.",
                "Docker for ``local``; hosted providers need their API keys in "
                "the environment as required by each driver.",
            ],
            "prereq_py": [
                "Python 3.10 or newer.",
                "Same environment expectations as the Go sample for the provider "
                "you pass on the command line.",
            ],
            "prereq_ts": [
                "Node.js 18 or newer (or Bun).",
                "Provider-specific env vars when you pass a non-local provider name.",
            ],
            "run_go": (
                "cd examples/go\n"
                "go run ./swap-provider-cli\n"
                "# optional: go run ./swap-provider-cli e2b"
            ),
            "run_py": (
                "PYTHONPATH=sdks/python/src python examples/python/swap-provider-cli/main.py\n"
                "# optional: same script with provider name as argv"
            ),
            "run_ts": (
                "npx tsx examples/typescript/swap-provider-cli/index.ts\n"
                "# optional: pass provider name as argv"
            ),
        },
    }

    for name, spec in data.items():
        for _lang, prereq_key, run_key, intro_key in (
            ("go", "prereq_go", "run_go", "intro_go"),
            ("python", "prereq_py", "run_py", "intro_py"),
            ("typescript", "prereq_ts", "run_ts", "intro_ts"),
        ):
            prereq = spec[prereq_key]
            run = spec[run_key]
            intro = spec.get(intro_key) or spec.get("intro")
            if intro is None:
                raise ValueError(
                    f"{name} missing intro ({intro_key} or intro) for {_lang}"
                )
            path = EXAMPLES / _lang / name / "README.md"
            path.write_text(readme(name, intro, prereq, run), encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
