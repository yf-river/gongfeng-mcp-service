import { requireToken, type GongfengConfig } from "./config.js";
import { type ApiResult, type Pagination } from "../types.js";

export class GongfengApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GongfengApiError";
  }
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

function paginationFromHeaders(headers: Headers, fallbackPage?: number, fallbackPerPage?: number): Pagination | undefined {
  const headerNumber = (name: string): number | undefined => {
    const value = headers.get(name);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const page = headerNumber("x-page") ?? fallbackPage ?? 1;
  const perPage = headerNumber("x-per-page") ?? fallbackPerPage ?? 20;
  const nextPage = headerNumber("x-next-page");
  const prevPage = headerNumber("x-prev-page");
  const total = headerNumber("x-total");
  const totalPages = headerNumber("x-total-pages");

  if (!nextPage && !prevPage && total === undefined && totalPages === undefined) {
    return undefined;
  }

  return {
    total,
    total_pages: totalPages,
    page,
    per_page: perPage,
    next_page: nextPage,
    prev_page: prevPage,
    has_more: Boolean(nextPage),
  };
}

function buildUrl(apiBase: string, apiPath: string, query?: RequestOptions["query"]): URL {
  const url = new URL(`${apiBase.replace(/\/+$/, "")}/${apiPath.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function statusHint(status: number): string {
  switch (status) {
    case 401:
      return "Unauthorized. Check GONGFENG_PRIVATE_TOKEN and token scopes.";
    case 403:
      return "Forbidden. Check project permissions and token scopes.";
    case 404:
      return "Not found. Check the project_id/path and resource identifier.";
    case 422:
      return "Validation failed. Check required fields and branch/resource state.";
    default:
      if (status >= 500) return "Gongfeng server error. Retry later or inspect the response details.";
      return "Gongfeng API request failed.";
  }
}

export class GongfengClient {
  constructor(
    private readonly config: GongfengConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(method: string, apiPath: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const token = requireToken(this.config);
    const url = buildUrl(this.config.apiBase, apiPath, options.query);
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": token,
      Accept: "application/json",
    };

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, { method, headers, body });
    const parsed = await readResponse(response);

    if (!response.ok) {
      const detailText = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new GongfengApiError(`${statusHint(response.status)} HTTP ${response.status}: ${detailText}`, response.status, parsed);
    }

    return {
      data: parsed as T,
      pagination: paginationFromHeaders(response.headers, Number(options.query?.page), Number(options.query?.per_page)),
      api_path: `${method.toUpperCase()} ${url.pathname}`,
    };
  }

  get<T>(apiPath: string, query?: RequestOptions["query"]): Promise<ApiResult<T>> {
    return this.request<T>("GET", apiPath, { query });
  }

  post<T>(apiPath: string, body?: Record<string, unknown>, query?: RequestOptions["query"]): Promise<ApiResult<T>> {
    return this.request<T>("POST", apiPath, { body, query });
  }

  put<T>(apiPath: string, body?: Record<string, unknown>, query?: RequestOptions["query"]): Promise<ApiResult<T>> {
    return this.request<T>("PUT", apiPath, { body, query });
  }

  delete<T>(apiPath: string, body?: Record<string, unknown>, query?: RequestOptions["query"]): Promise<ApiResult<T>> {
    return this.request<T>("DELETE", apiPath, { body, query });
  }
}
