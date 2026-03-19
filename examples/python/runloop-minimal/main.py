from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    key = os.environ.get("RUNLOOP_API_KEY")
    if not key:
        print("Set RUNLOOP_API_KEY", file=sys.stderr)
        sys.exit(1)
    cfg: dict[str, str] = {"api_key": key}
    if bu := os.environ.get("RUNLOOP_API_BASE"):
        cfg["base_url"] = bu
    client = Sandboxer("runloop", cfg)
    sb, _info = client.create_sandbox()
    try:
        r = sb.run_command(RunCommandRequest(cmd="echo hello from runloop"))
        print(r.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
