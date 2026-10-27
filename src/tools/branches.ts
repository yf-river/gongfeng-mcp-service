import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BranchNameSchema, PaginationSchema, ProjectIdSchema, ResponseFormatSchema } from "../schemas/common.js";
import { formatApiResult } from "../services/format.js";
import { encodeProjectId, requireExactConfirmation } from "../services/security.js";
import type { ToolContext } from "./shared.js";
import { registerZodTool } from "./shared.js";

export function registerBranchTools(server: McpServer, context: ToolContext): void {
  registerZodTool(
    server,
    "gongfeng_list_branches",
    z.object({ project_id: ProjectIdSchema, ...PaginationSchema }),
    {
      title: "List Gongfeng Branches",
      description: "List repository branches with page/per_page pagination.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, page, per_page, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/repository/branches`, { page, per_page });
      return formatApiResult("Gongfeng Branches", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_branch",
    z.object({ project_id: ProjectIdSchema, branch: BranchNameSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Branch",
      description: "Get one repository branch by name.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, branch, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/repository/branches/${encodeURIComponent(branch)}`);
      return formatApiResult("Gongfeng Branch", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_create_branch",
    z.object({
      project_id: ProjectIdSchema,
      branch: BranchNameSchema,
      ref: z.string().min(1).describe("Source branch, tag, or commit SHA."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Create Gongfeng Branch",
      description: "Create a branch from a source ref.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, branch, ref, response_format }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/repository/branches`, { branch, ref });
      return formatApiResult("Created Gongfeng Branch", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_delete_branch",
    z.object({
      project_id: ProjectIdSchema,
      branch: BranchNameSchema,
      confirm_target: z.string().min(1).describe("Must exactly match branch."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Delete Gongfeng Branch",
      description: "Delete a branch. Requires confirm_target to exactly match branch.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, branch, confirm_target, response_format }) => {
      requireExactConfirmation(confirm_target, branch, "branch");
      const result = await context.client.delete(`projects/${encodeProjectId(project_id)}/repository/branches/${encodeURIComponent(branch)}`);
      return formatApiResult("Deleted Gongfeng Branch", result, response_format);
    },
  );
}
