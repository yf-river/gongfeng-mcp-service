export type ResponseFormat = "json" | "markdown";

export interface Pagination {
  total?: number;
  total_pages?: number;
  page: number;
  per_page: number;
  next_page?: number;
  prev_page?: number;
  has_more: boolean;
}

export interface ApiResult<T = unknown> {
  data: T;
  pagination?: Pagination;
  api_path: string;
}

export interface ToolTextResult<T = unknown> {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
