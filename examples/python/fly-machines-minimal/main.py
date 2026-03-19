from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    tok = os.environ.get("FLY_API_TOKEN")
    app = os.environ.get("FLY_APP_NAME") or os.environ.get("SANDBOXER_FLY_APP")
    if not tok:
        print("Set FLY_API_TOKEN", file=sys.stderr)
        sys.exit(1)
    if not app:
        print("Set FLY_APP_NAME or SANDBOXER_FLY_APP", file=sys.stderr)
        sys.exit(1)
    cfg = {
        "api_key": tok,
        "base_url": os.environ.get("FLY_API_HOSTNAME", "https://api.machines.dev"),
    }
    client = Sandboxer("fly-machines", cfg)
    sb, _info = client.create_sandbox()
    try:
        r = sb.run_command(RunCommandRequest(cmd="echo hello from fly"))
        print(r.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
