import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PaginationSchema, ProjectIdSchema, ResponseFormatSchema, TagNameSchema } from "../schemas/common.js";
import { formatApiResult } from "../services/format.js";
import { encodeProjectId, requireExactConfirmation } from "../services/security.js";
import type { ToolContext } from "./shared.js";
import { cleanBody, registerZodTool } from "./shared.js";

export function registerTagTools(server: McpServer, context: ToolContext): void {
  registerZodTool(
    server,
    "gongfeng_list_tags",
    z.object({ project_id: ProjectIdSchema, ...PaginationSchema }),
    {
      title: "List Gongfeng Tags",
      description: "List repository tags with page/per_page pagination.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, page, per_page, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/repository/tags`, { page, per_page });
      return formatApiResult("Gongfeng Tags", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_tag",
    z.object({ project_id: ProjectIdSchema, tag_name: TagNameSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Tag",
      description: "Get one repository tag by name.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, tag_name, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/repository/tags/${encodeURIComponent(tag_name)}`);
      return formatApiResult("Gongfeng Tag", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_create_tag",
    z.object({
      project_id: ProjectIdSchema,
      tag_name: TagNameSchema,
      ref: z.string().min(1).describe("Source branch, tag, or commit SHA."),
      message: z.string().min(1).optional(),
      release_description: z.string().min(1).optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Create Gongfeng Tag",
      description: "Create a repository tag.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...body }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/repository/tags`, cleanBody(body));
      return formatApiResult("Created Gongfeng Tag", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_delete_tag",
    z.object({
      project_id: ProjectIdSchema,
      tag_name: TagNameSchema,
      confirm_target: z.string().min(1).describe("Must exactly match tag_name."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Delete Gongfeng Tag",
      description: "Delete a tag. Requires confirm_target to exactly match tag_name.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, tag_name, confirm_target, response_format }) => {
      requireExactConfirmation(confirm_target, tag_name, "tag_name");
      const result = await context.client.delete(`projects/${encodeProjectId(project_id)}/repository/tags/${encodeURIComponent(tag_name)}`);
      return formatApiResult("Deleted Gongfeng Tag", result, response_format);
    },
  );
}
