from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        sb.write_file("/tmp/demo.txt", b"hello files\n")
        data = sb.read_file("/tmp/demo.txt")
        print(data.decode())
        cat = sb.run_command(RunCommandRequest(cmd="cat /tmp/demo.txt"))
        print("exit:", cat.exit_code, "stdout:", cat.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
