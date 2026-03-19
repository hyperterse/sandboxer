from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        path = "/tmp/sandboxer-path-test"
        sb.make_dir(path)
        print("exists:", sb.exists(path))
        sb.write_file(f"{path}/x.txt", b"ok")
        print("file exists:", sb.exists(f"{path}/x.txt"))
        sb.remove(path)
        print("after rm exists:", sb.exists(path))
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
