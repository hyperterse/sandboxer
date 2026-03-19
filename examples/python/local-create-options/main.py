from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, CreateSandboxRequest, RunCommandRequest  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    req = CreateSandboxRequest(
        template="alpine:latest",
        metadata={"example": "local-create-options"},
        envs={"DEMO": "1"},
    )
    sb, info = client.create_sandbox(req)
    try:
        print("metadata:", info.metadata)
        r = sb.run_command(RunCommandRequest(cmd="sh -c 'echo $DEMO'"))
        print(r.stdout.strip())
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
