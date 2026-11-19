import { OpenSearchSearchRequest, OpenSearchSearchResponse, ServerConfig } from "../types.js";

interface OpenSearchClientOptions {
  fetchImpl?: typeof fetch;
}

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

const isRetryableStatus = (status: number): boolean => {
  return [408, 429, 500, 502, 503, 504].includes(status);
};

export class OpenSearchClient {
  private readonly fetchImpl: typeof fetch;

  public constructor(
    private readonly config: ServerConfig,
    options: OpenSearchClientOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async search<TSource = Record<string, unknown>>(
    index: string,
    body: OpenSearchSearchRequest
  ): Promise<OpenSearchSearchResponse<TSource>> {
    let url: URL;
    try {
      const baseUrl = new URL(this.config.baseUrl);
      const basePath = baseUrl.pathname.replace(/\/$/, "");
      baseUrl.pathname = `${basePath}/${encodeURIComponent(index)}/_search`;
      baseUrl.search = "";
      baseUrl.hash = "";
      url = baseUrl;
    } catch (error) {
      throw new Error(
        `Invalid GRACC_BASE_URL "${this.config.baseUrl}". Expected an absolute URL like https://gracc.opensciencegrid.org/q.`
      );
    }
    const requestBody = JSON.stringify(body);

    for (let attempt = 0; attempt <= this.config.safety.retryCount; attempt += 1) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), this.config.safety.requestTimeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: requestBody,
          signal: abortController.signal
        });

        clearTimeout(timeout);
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as unknown) : {};

        if (!response.ok) {
          const message = renderErrorMessage(response.status, payload);
          if (attempt < this.config.safety.retryCount && isRetryableStatus(response.status)) {
            await sleep(100 * (attempt + 1));
            continue;
          }

          throw new Error(message);
        }

        return payload as OpenSearchSearchResponse<TSource>;
      } catch (error) {
        clearTimeout(timeout);
        if (attempt < this.config.safety.retryCount) {
          await sleep(100 * (attempt + 1));
          continue;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(
            `OpenSearch request timed out after ${this.config.safety.requestTimeoutMs}ms.`
          );
        }

        throw error;
      }
    }

    throw new Error("OpenSearch request failed after exhausting retries.");
  }
}
