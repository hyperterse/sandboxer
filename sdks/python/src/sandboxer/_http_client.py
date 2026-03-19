from __future__ import annotations

import httpx


class HTTPError(Exception):
    def __init__(self, status: int, body: bytes):
        super().__init__(f"http status {status}")
        self.status = status
        self.body = body


class HttpClient:
    def __init__(self, timeout_s: float = 30.0):
        self._client = httpx.Client(timeout=timeout_s)

    def do(self, method: str, url: str, headers: dict[str, str], body: dict | None = None) -> dict | list | None:
        kwargs: dict = {"method": method, "url": url, "headers": headers}
        if body is not None:
            kwargs["json"] = body
        resp = self._client.request(**kwargs)
        if resp.status_code >= 400:
            raise HTTPError(resp.status_code, resp.content)
        if not resp.content:
            return None
        return resp.json()

    def do_raw(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        content: bytes | None = None,
        content_type: str | None = None,
    ) -> tuple[int, bytes]:
        h = dict(headers)
        if content_type:
            h["Content-Type"] = content_type
        resp = self._client.request(method=method, url=url, headers=h, content=content)
        if resp.status_code >= 400:
            raise HTTPError(resp.status_code, resp.content)
        return resp.status_code, resp.content

    def request(self, method: str, url: str, headers: dict[str, str], **kwargs) -> httpx.Response:
        """Low-level request for multipart uploads etc."""
        return self._client.request(method=method, url=url, headers=headers, **kwargs)

    def close(self) -> None:
        self._client.close()


class AsyncHttpClient:
    def __init__(self, timeout_s: float = 30.0):
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def do(self, method: str, url: str, headers: dict[str, str], body: dict | None = None) -> dict | list | None:
        kwargs: dict = {"method": method, "url": url, "headers": headers}
        if body is not None:
            kwargs["json"] = body
        resp = await self._client.request(**kwargs)
        if resp.status_code >= 400:
            raise HTTPError(resp.status_code, resp.content)
        if not resp.content:
            return None
        return resp.json()

    async def do_raw(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        content: bytes | None = None,
        content_type: str | None = None,
    ) -> tuple[int, bytes]:
        h = dict(headers)
        if content_type:
            h["Content-Type"] = content_type
        resp = await self._client.request(method=method, url=url, headers=h, content=content)
        if resp.status_code >= 400:
            raise HTTPError(resp.status_code, resp.content)
        return resp.status_code, resp.content

    async def request(self, method: str, url: str, headers: dict[str, str], **kwargs) -> httpx.Response:
        return await self._client.request(method=method, url=url, headers=headers, **kwargs)

    async def close(self) -> None:
        await self._client.aclose()
