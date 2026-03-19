from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, StartCommandRequest  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        _pid, handle = sb.start_command(StartCommandRequest(cmd="echo async-handle"))
        result = sb.wait_for_handle(handle)
        print(result.stdout.strip(), "exit:", result.exit_code)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
