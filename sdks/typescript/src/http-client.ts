export class HTTPError extends Error {
  status: number;
  body: Uint8Array;
  constructor(status: number, body: Uint8Array) {
    super(`http status ${status}`);
    this.name = "HTTPError";
    this.status = status;
    this.body = body;
  }
}

export class HttpClient {
  private timeoutMs: number;

  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  async do<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers: { ...headers },
        signal: controller.signal,
      };
      if (body !== undefined) {
        (init.headers as Record<string, string>)["Content-Type"] =
          "application/json";
        init.body = JSON.stringify(body);
      }
      const resp = await fetch(url, init);
      const raw = new Uint8Array(await resp.arrayBuffer());
      if (!resp.ok) {
        throw new HTTPError(resp.status, raw);
      }
      if (raw.length === 0) return undefined as T;
      return JSON.parse(new TextDecoder().decode(raw)) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async doRaw(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: BodyInit,
    contentType?: string,
  ): Promise<{ status: number; body: Uint8Array }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const h: Record<string, string> = { ...headers };
      if (contentType) h["Content-Type"] = contentType;
      const resp = await fetch(url, {
        method,
        headers: h,
        body,
        signal: controller.signal,
      });
      const raw = new Uint8Array(await resp.arrayBuffer());
      if (!resp.ok) {
        throw new HTTPError(resp.status, raw);
      }
      return { status: resp.status, body: raw };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchRaw(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      if (!resp.ok) {
        const raw = new Uint8Array(await resp.arrayBuffer());
        throw new HTTPError(resp.status, raw);
      }
      clearTimeout(timer); // Don't timeout during streaming
      return resp;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }
}
