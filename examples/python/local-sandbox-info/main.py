from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, info = client.create_sandbox()
    try:
        again = sb.info()
        print("id:", again.id)
        print("status:", again.status)
        print("provider:", again.provider)
        print("template:", again.template)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
