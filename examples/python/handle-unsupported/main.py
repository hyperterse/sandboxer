from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, CreatePTYRequest  # noqa: E402
from sandboxer.errors import NotSupportedError  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        try:
            sb.create_pty(CreatePTYRequest())
        except NotSupportedError as e:
            print("caught NotSupportedError:", e)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
