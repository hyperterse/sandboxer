from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    key = os.environ.get("E2B_API_KEY")
    if not key:
        print("Set E2B_API_KEY", file=sys.stderr)
        sys.exit(1)
    cfg = {
        "api_key": key,
        "base_url": os.environ.get("E2B_API_BASE", "https://api.e2b.app"),
    }
    if ms := os.environ.get("E2B_DEFAULT_TIMEOUT_MS"):
        cfg["default_timeout_ms"] = int(ms)
    client = Sandboxer("e2b", cfg)
    sb, _info = client.create_sandbox()
    try:
        r = sb.run_command(RunCommandRequest(cmd="echo config from environment"))
        print(r.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
