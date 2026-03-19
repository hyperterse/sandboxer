from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402
from sandboxer.errors import NotSupportedError  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        try:
            url = sb.port_url(8080)
            print("port_url:", url)
        except NotSupportedError as e:
            print("expected: no host port published for 8080 —", e)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
