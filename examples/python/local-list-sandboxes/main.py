from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        rows = client.list_sandboxes()
        print("count:", len(rows))
        for row in rows[:10]:
            print(row.id[:12], row.status)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
