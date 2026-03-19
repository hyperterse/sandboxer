from __future__ import annotations

import os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sdks", "python", "src"))

from sandboxer import Sandboxer, CreateSandboxRequest, ListSandboxesFilter, ProviderName  # noqa: E402


def main() -> None:
    client = Sandboxer("local", {})
    sb, _info = client.create_sandbox(
        CreateSandboxRequest(metadata={"filterdemo": "hello-filter"})
    )
    try:
        rows = client.list_sandboxes(
            ListSandboxesFilter(
                provider=ProviderName.LOCAL,
                metadata_filter="hello-filter",
                limit=20,
            )
        )
        print("matches:", len(rows))
    finally:
        sb.kill()
        client.close()


if __name__ == "__main__":
    main()
