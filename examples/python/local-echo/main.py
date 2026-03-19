from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        out = sb.run_command(RunCommandRequest(cmd="echo hello from local"))
        print(out.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
