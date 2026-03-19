from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        entries = sb.list_directory("/tmp")
        for e in entries[:20]:
            print(e.name, "dir" if e.is_dir else "file", e.size)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
