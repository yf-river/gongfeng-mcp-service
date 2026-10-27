import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PaginationSchema, ProjectIdSchema, ResponseFormatSchema, ReviewerIdsSchema } from "../schemas/common.js";
import { formatApiResult } from "../services/format.js";
import { encodeProjectId, requireExactConfirmation } from "../services/security.js";
import { getMergeRequestReviewWithFallback } from "./merge-requests.js";
import type { ToolContext } from "./shared.js";
import { cleanBody, registerZodTool, reviewerConfirmValue } from "./shared.js";

const MergeRequestIidSchema = z.union([z.number().int().positive(), z.string().min(1)]).describe("Merge request IID from the project URL.");
const ReviewIdSchema = z.union([z.number().int().positive(), z.string().min(1)]).describe("Code review ID or IID accepted by Gongfeng.");

export function registerReviewTools(server: McpServer, context: ToolContext): void {
  registerZodTool(
    server,
    "gongfeng_get_mr_review",
    z.object({ project_id: ProjectIdSchema, merge_request_iid: MergeRequestIidSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng MR Review",
      description: "Get review state for a merge request.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, response_format }) => {
      const result = await getMergeRequestReviewWithFallback(context.client, project_id, merge_request_iid);
      return formatApiResult("Gongfeng MR Review", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_set_mr_reviewer_summary",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema,
      summary: z.string().min(1).max(10000),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Set Gongfeng MR Reviewer Summary",
      description: "Set the current reviewer's summary for a merge request review.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, summary, response_format }) => {
      const result = await context.client.put(
        `projects/${encodeProjectId(project_id)}/merge_requests/${encodeURIComponent(String(merge_request_iid))}/review/summary`,
        { summary },
      );
      return formatApiResult("Set Gongfeng MR Reviewer Summary", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_reopen_mr_review",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema,
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Reopen Gongfeng MR Review",
      description: "Reopen a merge request review.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, response_format }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/merge_requests/${encodeURIComponent(String(merge_request_iid))}/review/reopen`);
      return formatApiResult("Reopened Gongfeng MR Review", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_create_review",
    z.object({
      project_id: ProjectIdSchema,
      title: z.string().min(1).max(500),
      source_branch: z.string().min(1).optional(),
      target_branch: z.string().min(1).optional(),
      base_commit: z.string().min(1).optional(),
      head_commit: z.string().min(1).optional(),
      description: z.string().optional(),
      reviewer_ids: ReviewerIdsSchema.optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Create Gongfeng Review",
      description: "Create a standalone code or commit review in Gongfeng.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...body }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/reviews`, cleanBody(body));
      return formatApiResult("Created Gongfeng Review", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_list_reviews",
    z.object({
      project_id: ProjectIdSchema,
      state: z.string().min(1).optional(),
      author_id: z.union([z.string(), z.number().int().positive()]).optional(),
      reviewer_id: z.union([z.string(), z.number().int().positive()]).optional(),
      ...PaginationSchema,
    }),
    {
      title: "List Gongfeng Reviews",
      description: "List standalone reviews with optional filters and pagination.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, response_format, ...query }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/reviews`, cleanBody(query));
      return formatApiResult("Gongfeng Reviews", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_review",
    z.object({ project_id: ProjectIdSchema, review_id: ReviewIdSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Review",
      description: "Get one standalone review by ID.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, review_id, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/reviews/${encodeURIComponent(String(review_id))}`);
      return formatApiResult("Gongfeng Review", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_invite_reviewers",
    z.object({
      project_id: ProjectIdSchema,
      review_id: ReviewIdSchema,
      reviewer_ids: ReviewerIdsSchema,
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Invite Gongfeng Reviewers",
      description: "Invite reviewers to a standalone Gongfeng review.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, review_id, reviewer_ids, response_format }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/reviews/${encodeURIComponent(String(review_id))}/reviewers`, { reviewer_ids });
      return formatApiResult("Invited Gongfeng Reviewers", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_remove_reviewers",
    z.object({
      project_id: ProjectIdSchema,
      review_id: ReviewIdSchema,
      reviewer_ids: ReviewerIdsSchema,
      confirm_target: z.string().min(1).describe("Must exactly match '<review_id>:<reviewer_id,reviewer_id>'."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Remove Gongfeng Reviewers",
      description: "Remove reviewers from a standalone review. Requires exact confirm_target.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, review_id, reviewer_ids, confirm_target, response_format }) => {
      requireExactConfirmation(confirm_target, reviewerConfirmValue(review_id, reviewer_ids), "reviewer removal target");
      const result = await context.client.delete(`projects/${encodeProjectId(project_id)}/reviews/${encodeURIComponent(String(review_id))}/reviewers`, { reviewer_ids });
      return formatApiResult("Removed Gongfeng Reviewers", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_update_review",
    z.object({
      project_id: ProjectIdSchema,
      review_id: ReviewIdSchema,
      title: z.string().min(1).max(500).optional(),
      description: z.string().optional(),
      state_event: z.string().min(1).optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Update Gongfeng Review",
      description: "Update standalone review metadata or state.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, review_id, response_format, ...body }) => {
      const result = await context.client.put(`projects/${encodeProjectId(project_id)}/reviews/${encodeURIComponent(String(review_id))}`, cleanBody(body));
      return formatApiResult("Updated Gongfeng Review", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_review_changed_files",
    z.object({ project_id: ProjectIdSchema, review_id: ReviewIdSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Review Changed Files",
      description: "Get changed files for a standalone code or commit review.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, review_id, response_format }) => {
      const result = await context.client.get(`projects/${encodeProjectId(project_id)}/reviews/${encodeURIComponent(String(review_id))}/changed_files`);
      return formatApiResult("Gongfeng Review Changed Files", result, response_format);
    },
  );
}
