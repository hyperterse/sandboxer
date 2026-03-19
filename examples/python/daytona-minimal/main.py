from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    tok = os.environ.get("DAYTONA_API_KEY") or os.environ.get("DAYTONA_TOKEN")
    if not tok:
        print("Set DAYTONA_API_KEY or DAYTONA_TOKEN", file=sys.stderr)
        sys.exit(1)
    cfg = {
        "api_key": tok,
        "base_url": os.environ.get("DAYTONA_API_BASE", "https://app.daytona.io/api"),
    }
    client = Sandboxer("daytona", cfg)
    sb, _info = client.create_sandbox()
    try:
        r = sb.run_command(RunCommandRequest(cmd="echo hello from daytona"))
        print(r.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
