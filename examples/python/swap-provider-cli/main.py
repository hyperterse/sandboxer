from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer  # noqa: E402
from sandboxer.errors import NotSupportedError  # noqa: E402


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "local"
    if which == "local":
        client = Sandboxer("local", {})
    elif which == "e2b":
        key = os.environ.get("E2B_API_KEY")
        if not key:
            print("E2B_API_KEY required", file=sys.stderr)
            sys.exit(1)
        client = Sandboxer(
            "e2b",
            {
                "api_key": key,
                "base_url": os.environ.get("E2B_API_BASE", "https://api.e2b.app"),
            },
        )
    elif which == "daytona":
        tok = os.environ.get("DAYTONA_API_KEY") or os.environ.get("DAYTONA_TOKEN")
        if not tok:
            print("DAYTONA_API_KEY or DAYTONA_TOKEN required", file=sys.stderr)
            sys.exit(1)
        client = Sandboxer(
            "daytona",
            {
                "api_key": tok,
                "base_url": os.environ.get(
                    "DAYTONA_API_BASE", "https://app.daytona.io/api"
                ),
            },
        )
    elif which == "runloop":
        key = os.environ.get("RUNLOOP_API_KEY")
        if not key:
            print("RUNLOOP_API_KEY required", file=sys.stderr)
            sys.exit(1)
        d: dict[str, str] = {"api_key": key}
        if bu := os.environ.get("RUNLOOP_API_BASE"):
            d["base_url"] = bu
        client = Sandboxer("runloop", d)
    elif which == "fly-machines":
        tok = os.environ.get("FLY_API_TOKEN")
        app = os.environ.get("FLY_APP_NAME") or os.environ.get("SANDBOXER_FLY_APP")
        if not tok:
            print("FLY_API_TOKEN required", file=sys.stderr)
            sys.exit(1)
        if not app:
            print("FLY_APP_NAME or SANDBOXER_FLY_APP required", file=sys.stderr)
            sys.exit(1)
        client = Sandboxer(
            "fly-machines",
            {
                "api_key": tok,
                "base_url": os.environ.get(
                    "FLY_API_HOSTNAME", "https://api.machines.dev"
                ),
            },
        )
    elif which == "blaxel":
        key = os.environ.get("BLAXEL_API_KEY")
        if not key:
            print("BLAXEL_API_KEY required", file=sys.stderr)
            sys.exit(1)
        client = Sandboxer("blaxel", {"api_key": key})
    else:
        print(f"unknown provider: {which}", file=sys.stderr)
        sys.exit(1)

    try:
        try:
            rows = client.list_sandboxes()
            print("sandboxes:", len(rows))
        except NotSupportedError as e:
            print("list_sandboxes not supported:", e)
    finally:
        client.close()


if __name__ == "__main__":
    main()
