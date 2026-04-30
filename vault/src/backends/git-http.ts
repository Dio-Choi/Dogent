import { requestUrl } from "obsidian";

interface IsoGitRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: AsyncIterable<Uint8Array> | Uint8Array[] | undefined;
}

interface IsoGitResponse {
  url: string;
  method: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: AsyncIterableIterator<Uint8Array>;
}

export const obsidianGitHttp = {
  async request(req: IsoGitRequest): Promise<IsoGitResponse> {
    const body = req.body ? await collectBody(req.body) : undefined;

    const res = await requestUrl({
      url: req.url,
      method: req.method ?? "GET",
      headers: req.headers,
      body: body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : undefined,
      throw: false,
    });

    const lowerHeaders: Record<string, string> = {};
    for (const k of Object.keys(res.headers)) {
      lowerHeaders[k.toLowerCase()] = res.headers[k];
    }

    const bytes = new Uint8Array(res.arrayBuffer);
    return {
      url: req.url,
      method: req.method ?? "GET",
      statusCode: res.status,
      statusMessage: statusText(res.status),
      headers: lowerHeaders,
      body: oneShot(bytes),
    };
  },
};

async function collectBody(
  body: AsyncIterable<Uint8Array> | Uint8Array[]
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (Array.isArray(body)) {
    for (const c of body) {
      chunks.push(c);
      total += c.byteLength;
    }
  } else {
    for await (const c of body) {
      chunks.push(c);
      total += c.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function oneShot(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  let done = false;
  const iter: AsyncIterableIterator<Uint8Array> = {
    async next(): Promise<IteratorResult<Uint8Array>> {
      if (done) return { value: undefined as unknown as Uint8Array, done: true };
      done = true;
      return { value: bytes, done: false };
    },
    [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
      return iter;
    },
  };
  return iter;
}

function statusText(code: number): string {
  switch (code) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 204:
      return "No Content";
    case 301:
      return "Moved Permanently";
    case 302:
      return "Found";
    case 304:
      return "Not Modified";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 500:
      return "Internal Server Error";
    default:
      return "";
  }
}
