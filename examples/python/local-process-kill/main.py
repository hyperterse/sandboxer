from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, RunCommandRequest  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox()
    try:
        r = sb.run_command(RunCommandRequest(cmd="sh -c 'sleep 120 & echo $!'"))
        pid = int(r.stdout.strip().split()[-1])
        sb.kill_process(pid)
        print("killed pid", pid)
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
