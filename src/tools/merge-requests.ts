import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PaginationSchema, ProjectIdSchema, ResponseFormatSchema, ReviewerIdsSchema } from "../schemas/common.js";
import type { GongfengClient } from "../services/api-client.js";
import { GongfengApiError } from "../services/api-client.js";
import { formatApiResult } from "../services/format.js";
import { encodeProjectId, requireExactConfirmation } from "../services/security.js";
import type { ApiResult } from "../types.js";
import type { ToolContext } from "./shared.js";
import { cleanBody, registerZodTool, reviewerConfirmValue } from "./shared.js";

const MergeRequestIidSchema = z.union([z.number().int().positive(), z.string().min(1)]).describe("Merge request IID from the project URL.");
const MergeRequestIdSchema = z.union([z.number().int().positive(), z.string().min(1)]).describe("Gongfeng internal merge request id.");

const RESOLVE_PAGE_SIZE = 100;
const RESOLVE_MAX_PAGES = 30;

/**
 * Gongfeng's /merge_requests list endpoint accepts only opened|merged|closed.
 * "all" is rejected silently: HTTP 200 with an empty array and X-Total: 0.
 * Omit the parameter instead, which means "every state".
 */
export function normalizeMergeRequestState(state?: string): string | undefined {
  return state === "all" ? undefined : state;
}

type MergeRequestRecord = Record<string, unknown> & {
  id?: string | number;
  iid?: string | number;
  source_branch?: string;
  target_branch?: string;
  state?: string;
  merge_commit_sha?: string;
};

function isNotFound(error: unknown): boolean {
  return error instanceof GongfengApiError && error.status === 404;
}

function sameID(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return false;
  return String(left) === String(right);
}

function pluralMergeRequestPath(projectID: string | number, iid: string | number, suffix = ""): string {
  return `projects/${encodeProjectId(projectID)}/merge_requests/${encodeURIComponent(String(iid))}${suffix}`;
}

function singularMergeRequestPath(projectID: string | number, id: string | number, suffix = ""): string {
  return `projects/${encodeProjectId(projectID)}/merge_request/${encodeURIComponent(String(id))}${suffix}`;
}

function listMergeRequestsPath(projectID: string | number): string {
  return `projects/${encodeProjectId(projectID)}/merge_requests`;
}

export async function resolveMergeRequestIdentity(
  client: GongfengClient,
  projectID: string | number,
  options: {
    merge_request_iid?: string | number;
    merge_request_id?: string | number;
    source_branch?: string;
    target_branch?: string;
  },
): Promise<MergeRequestRecord> {
  if (options.merge_request_id) {
    return { id: options.merge_request_id };
  }

  const criteria = cleanBody({
    merge_request_iid: options.merge_request_iid,
    source_branch: options.source_branch,
    target_branch: options.target_branch,
  });

  let page = 1;
  let scanned = 0;
  let pagesFetched = 0;

  while (pagesFetched < RESOLVE_MAX_PAGES) {
    const query = cleanBody({
      source_branch: options.source_branch,
      target_branch: options.target_branch,
      per_page: RESOLVE_PAGE_SIZE,
      page,
    });
    const list = await client.get<MergeRequestRecord[]>(listMergeRequestsPath(projectID), query);
    pagesFetched += 1;

    const items = Array.isArray(list.data) ? list.data : [];
    scanned += items.length;

    const matched = items.find((item) => {
      if (options.merge_request_iid && !sameID(item.iid, options.merge_request_iid)) return false;
      if (options.source_branch && item.source_branch !== options.source_branch) return false;
      if (options.target_branch && item.target_branch !== options.target_branch) return false;
      return true;
    });
    if (matched?.id) return matched;

    const pagination = list.pagination;
    const nextPage = pagination?.next_page;
    if (typeof nextPage === "number" && Number.isFinite(nextPage) && nextPage > page) {
      page = nextPage;
      continue;
    }
    if (pagination?.has_more === true) {
      page += 1;
      continue;
    }
    if (pagination?.has_more === false || items.length < RESOLVE_PAGE_SIZE) break;
    page += 1;
  }

  throw new GongfengApiError(
    `Unable to resolve Gongfeng merge request id from list endpoint after scanning ${scanned} merge request(s) across ${pagesFetched} page(s): ${JSON.stringify(criteria)}`,
    404,
    {
      criteria,
      returned_count: scanned,
      pages_scanned: pagesFetched,
      hint:
        "Gongfeng has no /merge_requests/:iid route and its list endpoint silently returns an empty array for state=all; " +
        "pass source_branch/target_branch or the internal merge_request_id if the IID is not in the scanned pages.",
    },
  );
}

export async function getMergeRequestWithFallback(
  client: GongfengClient,
  projectID: string | number,
  mergeRequestIid: string | number,
): Promise<ApiResult<MergeRequestRecord>> {
  try {
    return await client.get<MergeRequestRecord>(pluralMergeRequestPath(projectID, mergeRequestIid));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    const identity = await resolveMergeRequestIdentity(client, projectID, { merge_request_iid: mergeRequestIid });
    return await client.get<MergeRequestRecord>(singularMergeRequestPath(projectID, identity.id ?? mergeRequestIid));
  }
}

export async function getMergeRequestChangesWithFallback(
  client: GongfengClient,
  projectID: string | number,
  mergeRequestIid: string | number,
): Promise<ApiResult<unknown>> {
  try {
    return await client.get(pluralMergeRequestPath(projectID, mergeRequestIid, "/changes"));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    const identity = await resolveMergeRequestIdentity(client, projectID, { merge_request_iid: mergeRequestIid });
    return await client.get(singularMergeRequestPath(projectID, identity.id ?? mergeRequestIid, "/changes"));
  }
}

export async function getMergeRequestReviewWithFallback(
  client: GongfengClient,
  projectID: string | number,
  mergeRequestIid: string | number,
): Promise<ApiResult<unknown>> {
  try {
    return await client.get(pluralMergeRequestPath(projectID, mergeRequestIid, "/review"));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    const identity = await resolveMergeRequestIdentity(client, projectID, { merge_request_iid: mergeRequestIid });
    try {
      return await client.get(singularMergeRequestPath(projectID, identity.id ?? mergeRequestIid, "/review"));
    } catch (fallbackError) {
      if (!isNotFound(fallbackError)) throw fallbackError;
      return {
        data: {
          status: "review_unavailable",
          reason: "Gongfeng review endpoint returned 404 for both plural IID and singular ID paths.",
          merge_request: identity,
        },
        api_path: `GET ${singularMergeRequestPath(projectID, identity.id ?? mergeRequestIid, "/review")}`,
      };
    }
  }
}

export async function mergeMergeRequest(
  client: GongfengClient,
  projectID: string | number,
  options: {
    merge_request_iid?: string | number;
    merge_request_id?: string | number;
    source_branch?: string;
    target_branch?: string;
    remove_source_branch?: boolean;
    squash?: boolean;
  },
): Promise<ApiResult<unknown>> {
  const identity = await resolveMergeRequestIdentity(client, projectID, options);
  const id = identity.id ?? options.merge_request_id;
  if (!id) {
    throw new GongfengApiError("Unable to merge Gongfeng merge request because no internal merge request id was resolved.", 404, {
      options,
      identity,
    });
  }
  const result = await client.put(
    singularMergeRequestPath(projectID, id, "/merge"),
    cleanBody({
      remove_source_branch: options.remove_source_branch,
      squash: options.squash,
    }),
  );
  const verify = await client.get<MergeRequestRecord[]>(listMergeRequestsPath(projectID), cleanBody({
    state: "merged",
    source_branch: options.source_branch ?? identity.source_branch,
    target_branch: options.target_branch ?? identity.target_branch,
    per_page: 100,
  }));
  const merged = (Array.isArray(verify.data) ? verify.data : []).find((item) => sameID(item.id, id) || sameID(item.iid, identity.iid));
  return {
    ...result,
    data: {
      merge_result: result.data,
      verified_state: merged?.state === "merged" ? "merged" : "unknown",
      merge_commit_sha: (result.data as MergeRequestRecord)?.merge_commit_sha ?? merged?.merge_commit_sha ?? null,
      merge_request: merged ?? identity,
    },
  };
}

export function registerMergeRequestTools(server: McpServer, context: ToolContext): void {
  registerZodTool(
    server,
    "gongfeng_create_merge_request",
    z.object({
      project_id: ProjectIdSchema,
      source_branch: z.string().min(1),
      target_branch: z.string().min(1),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      assignee_id: z.union([z.string(), z.number().int().positive()]).optional(),
      target_project_id: ProjectIdSchema.optional(),
      remove_source_branch: z.boolean().optional(),
      squash: z.boolean().optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Create Gongfeng Merge Request",
      description: "Create a merge request for a Gongfeng project.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...body }) => {
      const result = await context.client.post(`projects/${encodeProjectId(project_id)}/merge_requests`, cleanBody(body));
      return formatApiResult("Created Gongfeng Merge Request", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_list_merge_requests",
    z.object({
      project_id: ProjectIdSchema,
      state: z
        .enum(["opened", "closed", "merged", "all"])
        .optional()
        .describe('Gongfeng merge request state; "all" or omit to list every state (Gongfeng rejects the literal "all").'),
      source_branch: z.string().min(1).optional(),
      target_branch: z.string().min(1).optional(),
      author_id: z.union([z.string(), z.number().int().positive()]).optional(),
      ...PaginationSchema,
    }),
    {
      title: "List Gongfeng Merge Requests",
      description: "List merge requests with optional filters and page/per_page pagination.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, response_format, ...query }) => {
      const normalized = { ...query, state: normalizeMergeRequestState(query.state) };
      const result = await context.client.get(listMergeRequestsPath(project_id), cleanBody(normalized));
      return formatApiResult("Gongfeng Merge Requests", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_merge_request",
    z.object({ project_id: ProjectIdSchema, merge_request_iid: MergeRequestIidSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Merge Request",
      description: "Get one merge request by project IID.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, response_format }) => {
      const result = await getMergeRequestWithFallback(context.client, project_id, merge_request_iid);
      return formatApiResult("Gongfeng Merge Request", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_update_merge_request",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema,
      title: z.string().min(1).max(500).optional(),
      description: z.string().optional(),
      target_branch: z.string().min(1).optional(),
      assignee_id: z.union([z.string(), z.number().int().positive()]).optional(),
      state_event: z.enum(["close", "reopen", "merge"]).optional(),
      remove_source_branch: z.boolean().optional(),
      squash: z.boolean().optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Update Gongfeng Merge Request",
      description: "Update merge request metadata or state_event.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, response_format, ...body }) => {
      if (body.state_event === "merge") {
        const result = await mergeMergeRequest(context.client, project_id, {
          merge_request_iid,
          remove_source_branch: body.remove_source_branch,
          squash: body.squash,
        });
        return formatApiResult("Merged Gongfeng Merge Request", result, response_format);
      }
      const result = await context.client.put(
        pluralMergeRequestPath(project_id, merge_request_iid),
        cleanBody(body),
      );
      return formatApiResult("Updated Gongfeng Merge Request", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_merge_merge_request",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema.optional(),
      merge_request_id: MergeRequestIdSchema.optional(),
      source_branch: z.string().min(1).optional(),
      target_branch: z.string().min(1).optional(),
      remove_source_branch: z.boolean().optional(),
      squash: z.boolean().optional(),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Merge Gongfeng Merge Request",
      description: "Merge a Gongfeng merge request using Gongfeng's internal MR id endpoint. If only IID or branches are provided, resolves the internal id through the list endpoint first.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, response_format, ...options }) => {
      if (!options.merge_request_id && !options.merge_request_iid && !options.source_branch) {
        throw new Error("Provide merge_request_id, merge_request_iid, or source_branch to identify the merge request.");
      }
      const result = await mergeMergeRequest(context.client, project_id, options);
      return formatApiResult("Merged Gongfeng Merge Request", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_get_merge_request_changes",
    z.object({ project_id: ProjectIdSchema, merge_request_iid: MergeRequestIidSchema, response_format: ResponseFormatSchema }),
    {
      title: "Get Gongfeng Merge Request Changes",
      description: "Get changed files and diffs for a merge request.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, response_format }) => {
      const result = await getMergeRequestChangesWithFallback(context.client, project_id, merge_request_iid);
      return formatApiResult("Gongfeng Merge Request Changes", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_invite_mr_reviewers",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema,
      reviewer_ids: ReviewerIdsSchema,
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Invite Gongfeng MR Reviewers",
      description: "Invite reviewers to a merge request. Endpoint is centralized here for easy adjustment if Gongfeng changes reviewer APIs.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, reviewer_ids, response_format }) => {
      const result = await context.client.post(
        `projects/${encodeProjectId(project_id)}/merge_requests/${encodeURIComponent(String(merge_request_iid))}/reviewers`,
        { reviewer_ids },
      );
      return formatApiResult("Invited Gongfeng MR Reviewers", result, response_format);
    },
  );

  registerZodTool(
    server,
    "gongfeng_remove_mr_reviewers",
    z.object({
      project_id: ProjectIdSchema,
      merge_request_iid: MergeRequestIidSchema,
      reviewer_ids: ReviewerIdsSchema,
      confirm_target: z.string().min(1).describe("Must exactly match '<merge_request_iid>:<reviewer_id,reviewer_id>'."),
      response_format: ResponseFormatSchema,
    }),
    {
      title: "Remove Gongfeng MR Reviewers",
      description: "Remove reviewers from a merge request. Requires exact confirm_target.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project_id, merge_request_iid, reviewer_ids, confirm_target, response_format }) => {
      requireExactConfirmation(confirm_target, reviewerConfirmValue(merge_request_iid, reviewer_ids), "reviewer removal target");
      const result = await context.client.delete(
        `projects/${encodeProjectId(project_id)}/merge_requests/${encodeURIComponent(String(merge_request_iid))}/reviewers`,
        { reviewer_ids },
      );
      return formatApiResult("Removed Gongfeng MR Reviewers", result, response_format);
    },
  );
}
