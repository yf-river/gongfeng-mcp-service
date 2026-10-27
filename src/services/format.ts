import type { ApiResult, ResponseFormat, ToolTextResult } from "../types.js";

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "_No items returned._";
    return value
      .map((item, index) => {
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const label = record.name ?? record.title ?? record.path ?? record.id ?? record.iid ?? `Item ${index + 1}`;
          const fields = Object.entries(record)
            .filter(([key]) => ["id", "iid", "name", "title", "state", "branch", "ref", "web_url"].includes(key))
            .map(([key, itemValue]) => `  - **${key}**: ${String(itemValue)}`)
            .join("\n");
          return `### ${String(label)}\n${fields || "  - returned"}`;
        }
        return `- ${String(item)}`;
      })
      .join("\n\n");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, itemValue]) => {
        if (typeof itemValue === "object" && itemValue !== null) {
          return `- **${key}**:\n\n\`\`\`json\n${JSON.stringify(itemValue, null, 2)}\n\`\`\``;
        }
        return `- **${key}**: ${String(itemValue)}`;
      })
      .join("\n");
  }

  return String(value);
}

export function formatToolResult<T>(
  title: string,
  output: T,
  responseFormat: ResponseFormat = "markdown",
): ToolTextResult<T> {
  const structuredContent =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : { result: output };
  const text =
    responseFormat === "json"
      ? JSON.stringify(output, null, 2)
      : [`# ${title}`, "", summarizeValue(output)].join("\n");

  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

export function formatApiResult<T>(
  title: string,
  result: ApiResult<T>,
  responseFormat: ResponseFormat = "markdown",
): ToolTextResult<ApiResult<T>> {
  if (responseFormat === "json") {
    return formatToolResult(title, result, "json");
  }

  const pagination = result.pagination
    ? [
        "",
        "## Pagination",
        `- **page**: ${result.pagination.page}`,
        `- **per_page**: ${result.pagination.per_page}`,
        `- **total**: ${result.pagination.total ?? "unknown"}`,
        `- **has_more**: ${result.pagination.has_more}`,
        result.pagination.next_page ? `- **next_page**: ${result.pagination.next_page}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return {
    content: [
      {
        type: "text",
        text: [`# ${title}`, "", summarizeValue(result.data), pagination].filter(Boolean).join("\n"),
      },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

export function formatError(error: unknown): ToolTextResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
    structuredContent: { error: message },
  };
}
