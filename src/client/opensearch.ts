import { OpenSearchSearchRequest, OpenSearchSearchResponse, ServerConfig } from "../types.js";
import { ConcurrencyLimiter } from "../utils/concurrency.js";
import { TtlLruCache } from "../utils/ttlCache.js";

interface OpenSearchClientOptions {
  fetchImpl?: typeof fetch;
}

// Only statuses that mean "the upstream is temporarily unavailable" are
// retried. Query errors (4xx, 500) and timeouts are not: retrying them only
// multiplies load on GRACC.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5_000;

class RetryableError extends Error {
  public constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

class ResponseTooLargeError extends Error {
  public constructor(maxBytes: number) {
    super(`GRACC response exceeded ${maxBytes} bytes. Narrow the query or request fewer fields.`);
    this.name = "ResponseTooLargeError";
  }
}

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";

const parseJson = (text: string): unknown => {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const renderErrorMessage = (status: number, payload: unknown): string => {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "reason" in payload.error &&
    typeof payload.error.reason === "string"
  ) {
    return `${status} ${payload.error.reason}`;
  }

  return `OpenSearch request failed with status ${status}.`;
};

const parseRetryAfterMs = (header: string | null): number | undefined => {
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const readBodyWithLimit = async (response: Response, maxBytes: number): Promise<string> => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(maxBytes);
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(maxBytes);
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
};

export class OpenSearchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly cache: TtlLruCache;
  private readonly limiter: ConcurrencyLimiter;
  private readonly inFlight = new Map<string, Promise<string>>();

  public constructor(
    private readonly config: ServerConfig,
    options: OpenSearchClientOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cache = new TtlLruCache({
      ttlMs: config.upstream.cacheTtlSeconds * 1000,
      maxBytes: config.upstream.cacheMaxBytes
    });
    this.limiter = new ConcurrencyLimiter(config.upstream.maxConcurrent, config.upstream.maxQueued);
  }

  public async search<TSource = Record<string, unknown>>(
    index: string,
    body: OpenSearchSearchRequest
  ): Promise<OpenSearchSearchResponse<TSource>> {
    const url = this.buildUrl(index);
    const requestBody = JSON.stringify(body);
    const key = `${url.toString()}\n${requestBody}`;

    const text = this.cache.get(key) ?? (await this.fetchCoalesced(key, url, requestBody));
    return JSON.parse(text) as OpenSearchSearchResponse<TSource>;
  }

  private buildUrl(index: string): URL {
    try {
      const url = new URL(this.config.baseUrl);
      const basePath = url.pathname.replace(/\/$/, "");
      url.pathname = `${basePath}/${encodeURIComponent(index)}/_search`;
      url.search = "";
      url.hash = "";
      return url;
    } catch {
      throw new Error(
        `Invalid GRACC_BASE_URL "${this.config.baseUrl}". Expected an absolute URL like https://gracc.opensciencegrid.org/q.`
      );
    }
  }

  /** Identical concurrent searches share one upstream request. */
  private fetchCoalesced(key: string, url: URL, body: string): Promise<string> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const request = this.limiter
      .run(() => this.fetchWithRetry(url, body))
      .then((text) => {
        this.cache.set(key, text);
        return text;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  private async fetchWithRetry(url: URL, body: string): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.fetchOnce(url, body);
      } catch (error) {
        if (!(error instanceof RetryableError)) {
          throw error;
        }

        const delay =
          error.retryAfterMs ?? RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_BASE_DELAY_MS;
        if (attempt >= this.config.safety.retryCount || delay > MAX_RETRY_DELAY_MS) {
          throw new Error(error.message);
        }

        await sleep(delay);
      }
    }
  }

  private async fetchOnce(url: URL, body: string): Promise<string> {
    const timeoutMs = this.config.safety.requestTimeoutMs;
    const timeoutMessage = `OpenSearch request timed out after ${timeoutMs}ms.`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body,
          signal: controller.signal
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new Error(timeoutMessage);
        }
        throw new RetryableError(
          `Could not reach GRACC: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      let text: string;
      try {
        text = await readBodyWithLimit(response, this.config.upstream.maxResponseBytes);
      } catch (error) {
        if (error instanceof ResponseTooLargeError) {
          throw error;
        }
        if (isAbortError(error)) {
          throw new Error(timeoutMessage);
        }
        throw new RetryableError(
          `GRACC response was interrupted: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const payload = parseJson(text);

      if (!response.ok) {
        const message = renderErrorMessage(response.status, payload);
        if (RETRYABLE_STATUSES.has(response.status)) {
          throw new RetryableError(message, parseRetryAfterMs(response.headers.get("retry-after")));
        }
        throw new Error(message);
      }

      if (payload === undefined) {
        throw new Error("GRACC returned a response that is not valid JSON.");
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
