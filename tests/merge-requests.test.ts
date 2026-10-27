import { describe, expect, it } from "vitest";
import { GongfengApiError } from "../src/services/api-client.js";
import {
  getMergeRequestWithFallback,
  mergeMergeRequest,
  normalizeMergeRequestState,
  resolveMergeRequestIdentity,
} from "../src/tools/merge-requests.js";

describe("merge request endpoint compatibility", () => {
  it("resolves Gongfeng internal merge request id through the list endpoint", async () => {
    const calls: Array<{ path: string; query?: Record<string, unknown> }> = [];
    const client = {
      async get(path: string, query?: Record<string, unknown>) {
        calls.push({ path, query });
        return {
          api_path: `GET ${path}`,
          data: [
            { id: 2177041, iid: 73, source_branch: "feature", target_branch: "main", state: "opened" },
          ],
        };
      },
    };

    const identity = await resolveMergeRequestIdentity(client as never, "ChainWeaver/ida/user-center", {
      merge_request_iid: 73,
      source_branch: "feature",
      target_branch: "main",
    });

    expect(identity.id).toBe(2177041);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("projects/ChainWeaver%2Fida%2Fuser-center/merge_requests");
    expect(calls[0].query).toEqual({
      source_branch: "feature",
      target_branch: "main",
      per_page: 100,
      page: 1,
    });
    expect(calls[0].query).not.toHaveProperty("state");
  });

  it("paginates the list endpoint when the IID is beyond the first page", async () => {
    const pages: number[] = [];
    const client = {
      async get(_path: string, query?: Record<string, unknown>) {
        const page = Number(query?.page ?? 1);
        pages.push(page);
        if (page === 1) {
          return {
            api_path: "GET list",
            data: Array.from({ length: 100 }, (_, index) => ({ id: 3000000 + index, iid: 1000 + index })),
            pagination: { total: 101, page: 1, per_page: 100, next_page: 2, has_more: true },
          };
        }
        return {
          api_path: "GET list",
          data: [{ id: 2255663, iid: 1, source_branch: "feature/gong-30-go-web", target_branch: "master" }],
          pagination: { total: 101, page: 2, per_page: 100, has_more: false },
        };
      },
    };

    const identity = await resolveMergeRequestIdentity(client as never, "ChainWeaver/chainweaver-flow", {
      merge_request_iid: 1,
    });

    expect(identity.id).toBe(2255663);
    expect(pages).toEqual([1, 2]);
  });

  it("reports scanned counts when the IID cannot be found", async () => {
    const client = {
      async get() {
        return {
          api_path: "GET list",
          data: [{ id: 2177041, iid: 73 }],
          pagination: { total: 1, page: 1, per_page: 100, has_more: false },
        };
      },
    };

    await expect(
      resolveMergeRequestIdentity(client as never, "ChainWeaver/ida/user-center", { merge_request_iid: 999 }),
    ).rejects.toMatchObject({
      status: 404,
      details: { returned_count: 1, pages_scanned: 1 },
    });
  });

  it("falls back from plural IID detail to singular internal-id detail", async () => {
    const calls: string[] = [];
    const client = {
      async get(path: string) {
        calls.push(`GET ${path}`);
        if (path.endsWith("/merge_requests/73")) {
          throw new GongfengApiError("not found", 404);
        }
        if (path.endsWith("/merge_requests")) {
          return {
            api_path: `GET ${path}`,
            data: [{ id: 2177041, iid: 73, source_branch: "feature", target_branch: "main" }],
          };
        }
        return {
          api_path: `GET ${path}`,
          data: { id: 2177041, iid: 73, state: "opened" },
        };
      },
    };

    const result = await getMergeRequestWithFallback(client as never, "ChainWeaver/ida/user-center", 73);

    expect(result.data).toMatchObject({ id: 2177041, iid: 73 });
    expect(calls).toEqual([
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_requests/73",
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_requests",
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041",
    ]);
  });

  it("merges through singular internal-id endpoint and verifies merged state", async () => {
    const calls: string[] = [];
    let listCalls = 0;
    const client = {
      async get(path: string) {
        calls.push(`GET ${path}`);
        listCalls += 1;
        return {
          api_path: `GET ${path}`,
          data: [
            {
              id: 2177041,
              iid: 73,
              source_branch: "feature",
              target_branch: "main",
              state: listCalls > 1 ? "merged" : "opened",
              merge_commit_sha: "abc123",
            },
          ],
        };
      },
      async put(path: string) {
        calls.push(`PUT ${path}`);
        return {
          api_path: `PUT ${path}`,
          data: { id: 2177041, iid: 73, state: "merged", merge_commit_sha: "abc123" },
        };
      },
    };

    const result = await mergeMergeRequest(client as never, "ChainWeaver/ida/user-center", {
      merge_request_iid: 73,
      source_branch: "feature",
      target_branch: "main",
    });

    expect(result.data).toMatchObject({ verified_state: "merged", merge_commit_sha: "abc123" });
    expect(calls).toEqual([
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_requests",
      "PUT projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041/merge",
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_requests",
    ]);
  });

  it("drops the unsupported state=all filter before calling Gongfeng", () => {
    expect(normalizeMergeRequestState("all")).toBeUndefined();
    expect(normalizeMergeRequestState("merged")).toBe("merged");
    expect(normalizeMergeRequestState(undefined)).toBeUndefined();
  });
});
