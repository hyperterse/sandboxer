from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402
from sandboxer.errors import ProviderError  # noqa: E402


def main() -> None:
    key = ""
    for v in (
        os.environ.get("BLAXEL_API_KEY"),
        os.environ.get("BL_API_KEY"),
        os.environ.get("SANDBOXER_API_KEY"),
    ):
        if v:
            key = v
            break
    if not key:
        print(
            "Set BLAXEL_API_KEY (or BL_API_KEY / SANDBOXER_API_KEY).", file=sys.stderr
        )
        sys.exit(1)
    client = Sandboxer("blaxel", {"api_key": key})
    try:
        sb, info = client.create_sandbox()
        print("created sandbox:", info.id, "status:", info.status)
        sb.kill()
        print("deleted sandbox:", info.id)
    except ProviderError as e:
        print("provider error:", e, file=sys.stderr)
        sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
