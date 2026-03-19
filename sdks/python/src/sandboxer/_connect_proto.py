from __future__ import annotations

import json
import struct
from typing import Callable, Any

from ._http_client import HttpClient, AsyncHttpClient, HTTPError

CONNECT_PROTOCOL_VERSION = "Connect-Protocol-Version"
CONNECT_TIMEOUT_MS = "Connect-Timeout-Ms"


def unary_post(hc: HttpClient, url: str, headers: dict[str, str], req_msg: Any) -> Any:
    h = {**headers, CONNECT_PROTOCOL_VERSION: "1"}
    try:
        status, raw = hc.do_raw("POST", url, h, content=json.dumps(req_msg).encode(), content_type="application/json")
    except HTTPError as e:
        raise _decode_connect_err(e) from e
    if not raw:
        return None
    parsed = json.loads(raw)
    if "error" in parsed and parsed["error"]:
        msg = parsed["error"].get("message", json.dumps(parsed["error"]))
        raise Exception(f"connect error: {msg}")
    if "result" in parsed:
        return parsed["result"]
    return parsed


def stream_post(hc: HttpClient, url: str, headers: dict[str, str], req_msg: Any, each: Callable[[Any], None]) -> None:
    h = {
        **headers,
        CONNECT_PROTOCOL_VERSION: "1",
        "Content-Type": "application/json",
        "Accept": "application/connect+json",
    }
    resp = hc.request("POST", url, h, content=json.dumps(req_msg).encode())
    if resp.status_code >= 400:
        raise _decode_connect_err(HTTPError(resp.status_code, resp.content))
    _read_connect_stream(resp.content, each)


def _read_connect_stream(data: bytes, each: Callable[[Any], None]) -> None:
    offset = 0
    while offset + 5 <= len(data):
        frame_len = struct.unpack(">I", data[offset + 1 : offset + 5])[0]
        if frame_len <= 0 or frame_len > 64 * 1024 * 1024:
            raise Exception(f"connect stream: invalid frame size {frame_len}")
        if offset + 5 + frame_len > len(data):
            break
        payload = data[offset + 5 : offset + 5 + frame_len]
        offset += 5 + frame_len
        parsed = json.loads(payload)
        if "error" in parsed and parsed["error"]:
            msg = parsed["error"].get("message", json.dumps(parsed["error"]))
            raise Exception(f"connect stream error: {msg}")
        each(parsed)


def _decode_connect_err(he: HTTPError) -> Exception:
    try:
        env = json.loads(he.body)
        if "message" in env:
            return Exception(f"http {he.status}: {env['message']}")
    except (json.JSONDecodeError, KeyError):
        pass
    return Exception(f"http {he.status}: {he.body.decode(errors='replace')}")
