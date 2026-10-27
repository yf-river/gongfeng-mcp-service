import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GongfengClient } from "../services/api-client.js";
import { formatError } from "../services/format.js";
import type { GitService } from "../services/git.js";
import type { ToolTextResult } from "../types.js";

export interface ToolContext {
  client: GongfengClient;
  git: GitService;
}

export function registerZodTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  server: McpServer,
  name: string,
  schema: TSchema,
  config: {
    title: string;
    description: string;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  },
  handler: (params: z.infer<TSchema>) => Promise<ToolTextResult>,
): void {
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: schema.shape,
      annotations: config.annotations,
    },
    async (rawParams) => {
      try {
        const params = schema.parse(rawParams);
        return await handler(params);
      } catch (error) {
        return formatError(error);
      }
    },
  );
}

export function cleanBody<T extends Record<string, unknown>>(body: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

export function reviewerConfirmValue(resourceId: string | number, reviewerIds: Array<string | number>): string {
  return `${resourceId}:${reviewerIds.map(String).join(",")}`;
}
