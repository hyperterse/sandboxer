from __future__ import annotations

import asyncio
import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import AsyncSandboxer, RunCommandRequest  # noqa: E402


async def main() -> None:
    client = AsyncSandboxer("local", {})
    sb, _info = await client.create_sandbox()
    try:
        r = await sb.run_command(RunCommandRequest(cmd="echo async workflow"))
        print(r.stdout.strip())
    finally:
        await sb.kill()
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
