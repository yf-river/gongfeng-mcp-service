import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CommitMessageSchema, ProjectIdSchema, ResponseFormatSchema } from "../schemas/common.js";
import { formatApiResult, formatToolResult } from "../services/format.js";
import { encodeProjectId, requireExactConfirmation } from "../services/security.js";
import type { ToolContext } from "./shared.js";
import { cleanBody, registerZodTool } from "./shared.js";

const FilePathSchema = z.string().min(1).max(4096).describe("Repository file path, for example README.md or src/index.ts.");
const RefSchema = z.string().min(1).describe("Branch, tag, or commit SHA.");

export function registerFileTools(server: McpServer, context: ToolContext): void {
  registerZodTool(
    server,
    "gongfeng_get_file",
    z.object({
      project_id: ProjectIdSchema,
      file_path: FilePathSchema,
      ref: RefSchema,
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Get Gongfeng File",
      description: "Read a file from a Gongfeng repository through /api/v3/projects/:id/repository/files.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, file_path, ref, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/repository/files`, { file_path, ref });
      return formatApiResult("Gongfeng File", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_create_file",
    z.object({
      project_id: ProjectIdSchema,
      file_path: FilePathSchema,
      branch: z.string().min(1),
      content: z.string().describe("File content."),
      commit_message: CommitMessageSchema,
      encoding: z.enum(["text", "base64"]).optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Create Gongfeng File",
      description: "Create a repository file in Gongfeng.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...body }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/repository/files`, cleanBody(body));
      return formatApiResult("Created Gongfeng File", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_update_file",
    z.object({
      project_id: ProjectIdSchema,
      file_path: FilePathSchema,
      branch: z.string().min(1),
      content: z.string(),
      commit_message: CommitMessageSchema,
      encoding: z.enum(["text", "base64"]).optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Update Gongfeng File",
      description: "Update an existing repository file in Gongfeng.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...body }) => {
      const result = await context.client.put(`projects/${encodeProjectId(project_id)}/repository/files`, cleanBody(body));
      return formatApiResult("Updated Gongfeng File", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_delete_file",
    z.object({
      project_id: ProjectIdSchema,
      file_path: FilePathSchema,
      branch: z.string().min(1),
      commit_message: CommitMessageSchema,
      confirm_target: z.string().min(1).describe("Must exactly match file_path."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Delete Gongfeng File",
      description: "Delete a repository file. Requires confirm_target to exactly match file_path.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, file_path, branch, commit_message, confirm_target, response_format }) => {
      requireExactConfirmation(confirm_target, file_path, "file_path");
      const result = await context.client.delete(`projects/${encodeProjectId(project_id)}/repository/files`, {
        file_path,
        branch,
        commit_message,
      });
      return formatApiResult("Deleted Gongfeng File", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_clone_repo",
    z.object({
      repo_ssh_url: z.string().min(1).describe("SSH clone URL, for example git@git.code.tencent.com:group/repo.git."),
      target_dir: z.string().min(1).describe("Target directory relative to GONGFENG_WORKDIR."),
      branch: z.string().min(1).optional(),
      depth: z.number().int().positive().max(10000).optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Clone Gongfeng Repository",
      description: "Clone a Gongfeng repository into GONGFENG_WORKDIR using GONGFENG_SSH_KEY_PATH when configured.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ repo_ssh_url, target_dir, branch, depth, response_format }) => {
      const output = await context.git.cloneRepo(repo_ssh_url, target_dir, { branch, depth });
      return formatToolResult("Cloned Gongfeng Repository", output, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_git_status",
    z.object({
      repo_path: z.string().min(1).describe("Repository path relative to GONGFENG_WORKDIR."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Gongfeng Git Status",
      description: "Run git status --short --branch for a repository inside GONGFENG_WORKDIR.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ repo_path, response_format }) => {
      const output = await context.git.status(repo_path);
      return formatToolResult("Gongfeng Git Status", output, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_git_commit_changes",
    z.object({
      repo_path: z.string().min(1).describe("Repository path relative to GONGFENG_WORKDIR."),
      commit_message: CommitMessageSchema,
      paths: z.array(z.string().min(1)).min(1).default(["."]).describe("Pathspecs to add before committing."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Commit Gongfeng Git Changes",
      description: "Run git add and git commit in a local repository inside GONGFENG_WORKDIR.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ repo_path, commit_message, paths, response_format }) => {
      const output = await context.git.commitChanges(repo_path, commit_message, paths);
      return formatToolResult("Committed Gongfeng Git Changes", output, response_format);
    },
  );
}
