import { HttpClient, HTTPError } from "./http-client.js";

const CONNECT_PROTOCOL_VERSION = "Connect-Protocol-Version";

export async function unaryPost<T>(
  hc: HttpClient,
  url: string,
  headers: Record<string, string>,
  reqMsg: unknown,
): Promise<T> {
  const h = { ...headers, [CONNECT_PROTOCOL_VERSION]: "1" };
  try {
    const resp = await hc.doRaw(
      "POST",
      url,
      h,
      JSON.stringify(reqMsg),
      "application/json",
    );
    if (resp.body.length === 0) return undefined as T;
    const text = new TextDecoder().decode(resp.body);
    const parsed = JSON.parse(text);
    if (parsed.error) {
      throw new Error(
        `connect error: ${parsed.error.message || JSON.stringify(parsed.error)}`,
      );
    }
    if (parsed.result !== undefined) return parsed.result as T;
    return parsed as T;
  } catch (e) {
    if (e instanceof HTTPError) {
      throw decodeConnectErr(e);
    }
    throw e;
  }
}

export async function streamPost(
  hc: HttpClient,
  url: string,
  headers: Record<string, string>,
  reqMsg: unknown,
  each: (msg: unknown) => void,
): Promise<void> {
  const h: Record<string, string> = {
    ...headers,
    [CONNECT_PROTOCOL_VERSION]: "1",
    "Content-Type": "application/json",
    Accept: "application/connect+json",
  };
  const resp = await hc.fetchRaw(url, {
    method: "POST",
    headers: h,
    body: JSON.stringify(reqMsg),
  });
  if (!resp.body) throw new Error("no response body for stream");
  const reader = resp.body.getReader();
  let buffer = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      const newBuf = new Uint8Array(buffer.length + value.length);
      newBuf.set(buffer);
      newBuf.set(value, buffer.length);
      buffer = newBuf;
    }
    // Process complete frames
    while (buffer.length >= 5) {
      const frameLen = new DataView(
        buffer.buffer,
        buffer.byteOffset + 1,
        4,
      ).getUint32(0);
      if (frameLen <= 0 || frameLen > 64 * 1024 * 1024) {
        throw new Error(`connect stream: invalid frame size ${frameLen}`);
      }
      if (buffer.length < 5 + frameLen) break;
      const payload = buffer.slice(5, 5 + frameLen);
      buffer = buffer.slice(5 + frameLen);
      const text = new TextDecoder().decode(payload);
      const parsed = JSON.parse(text);
      if (parsed.error) {
        throw new Error(
          `connect stream error: ${parsed.error.message || JSON.stringify(parsed.error)}`,
        );
      }
      each(parsed);
    }
    if (done) break;
  }
}

function decodeConnectErr(he: HTTPError): Error {
  try {
    const text = new TextDecoder().decode(he.body);
    const env = JSON.parse(text);
    if (env.message) return new Error(`http ${he.status}: ${env.message}`);
  } catch {
    /* ignore */
  }
  return new Error(`http ${he.status}: ${new TextDecoder().decode(he.body)}`);
}
