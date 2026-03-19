from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, CreatePTYRequest  # noqa: E402
from sandboxer.errors import NotSupportedError  # noqa: E402


def main() -> None:
    key = os.environ.get("E2B_API_KEY")
    if not key:
        print("Set E2B_API_KEY", file=sys.stderr)
        sys.exit(1)
    cfg = {
        "api_key": key,
        "base_url": os.environ.get("E2B_API_BASE", "https://api.e2b.app"),
    }
    client = Sandboxer("e2b", cfg)
    sb, _info = client.create_sandbox()
    try:
        try:
            sb.create_pty(CreatePTYRequest())
        except NotSupportedError as e:
            print("PTY not supported by E2B provider in this SDK:", e)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
