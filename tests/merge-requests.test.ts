import { describe, expect, it } from "vitest";
import { GongfengApiError } from "../src/services/api-client.js";
import {
  changeMergeRequestReviewers,
  getMergeRequestChangesWithFallback,
  getMergeRequestWithFallback,
  mergeMergeRequest,
  normalizeMergeRequestState,
  resolveMergeRequestIdentity,
  updateMergeRequest,
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

describe("merge request write paths", () => {
  it("updates through the singular internal-id route and verifies the record", async () => {
    const calls: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const client = {
      async get(path: string) {
        calls.push(`GET ${path}`);
        if (path.endsWith("/merge_requests")) {
          return { api_path: `GET ${path}`, data: [{ id: 2177041, iid: 73, state: "opened" }] };
        }
        return { api_path: `GET ${path}`, data: { id: 2177041, iid: 73, title: "new title", state: "closed" } };
      },
      async put(path: string, body: Record<string, unknown>) {
        calls.push(`PUT ${path}`);
        bodies.push(body);
        return { api_path: `PUT ${path}`, data: { id: 2177041, iid: 73 } };
      },
    };

    const result = await updateMergeRequest(client as never, "ChainWeaver/ida/user-center", {
      merge_request_iid: 73,
      title: "new title",
      state_event: "close",
    });

    expect(calls).toEqual([
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_requests",
      "PUT projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041",
      "GET projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041",
    ]);
    expect(bodies).toEqual([{ title: "new title", state_event: "close" }]);
    expect(result.data.merge_request).toMatchObject({ id: 2177041, title: "new title" });
  });

  it("rejects merge-only flags on a plain update and empty update bodies", async () => {
    const client = { async get() { throw new Error("must not call the API"); } };

    await expect(
      updateMergeRequest(client as never, "p", { merge_request_iid: 1, squash: true }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateMergeRequest(client as never, "p", { merge_request_iid: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("invites reviewers one by one on the singular review endpoint", async () => {
    const calls: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const client = {
      async get(path: string) {
        calls.push(`GET ${path}`);
        if (path.endsWith("/merge_requests")) {
          return { api_path: `GET ${path}`, data: [{ id: 2177041, iid: 73 }] };
        }
        return { api_path: `GET ${path}`, data: { reviewers: [{ id: 7 }] } };
      },
      async post(path: string, body: Record<string, unknown>) {
        calls.push(`POST ${path}`);
        bodies.push(body);
        if (String(body.reviewer_id) === "8") throw new GongfengApiError("conflict", 409);
        return { api_path: `POST ${path}`, data: {} };
      },
    };

    const result = await changeMergeRequestReviewers(
      client as never,
      "ChainWeaver/ida/user-center",
      { merge_request_iid: 73, reviewer_ids: [7, "8"] },
      "invite",
    );

    expect(bodies).toEqual([{ reviewer_id: 7 }, { reviewer_id: 8 }]);
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([
      "POST projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041/review/invite",
      "POST projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041/review/invite",
    ]);
    expect(result.data.succeeded).toEqual(["7"]);
    expect(result.data.failed).toHaveLength(1);
    expect(result.data.failed[0]).toMatchObject({ reviewer_id: "8", status: 409 });
    expect(result.data.review).toEqual({ reviewers: [{ id: 7 }] });
  });

  it("removes reviewers through the dismissals endpoint with a reviewer_id query", async () => {
    const deletes: string[] = [];
    const client = {
      async get(path: string) {
        if (path.endsWith("/merge_requests")) return { api_path: "GET list", data: [{ id: 2177041, iid: 73 }] };
        return { api_path: `GET ${path}`, data: { reviewers: [] } };
      },
      async delete(path: string, _body: unknown, query: Record<string, unknown>) {
        deletes.push(`DELETE ${path}?reviewer_id=${String(query.reviewer_id)}`);
        return { api_path: `DELETE ${path}`, data: {} };
      },
    };

    const result = await changeMergeRequestReviewers(
      client as never,
      "ChainWeaver/ida/user-center",
      { merge_request_iid: 73, reviewer_ids: [7] },
      "remove",
    );

    expect(deletes).toEqual([
      "DELETE projects/ChainWeaver%2Fida%2Fuser-center/merge_request/2177041/review/dismissals?reviewer_id=7",
    ]);
    expect(result.data.succeeded).toEqual(["7"]);
    expect(result.data.failed).toEqual([]);
  });

  it("surfaces every reviewer failure when nothing succeeds", async () => {
    const client = {
      async get(path: string) {
        if (path.endsWith("/merge_requests")) return { api_path: "GET list", data: [{ id: 2177041, iid: 73 }] };
        return { api_path: `GET ${path}`, data: {} };
      },
      async delete() {
        throw new GongfengApiError("Reviewer not found", 404);
      },
    };

    await expect(
      changeMergeRequestReviewers(
        client as never,
        "ChainWeaver/ida/user-center",
        { merge_request_iid: 73, reviewer_ids: [7, 8] },
        "remove",
      ),
    ).rejects.toMatchObject({
      status: 404,
      details: { action: "remove", failed: [{ reviewer_id: "7" }, { reviewer_id: "8" }] },
    });
  });

  it("adds a GitLab-compatible changes alias to the Gongfeng files payload", async () => {
    const files = [{ old_path: "a.txt", new_path: "a.txt" }, { old_path: "b.txt", new_path: "b.txt" }];
    const client = {
      async get() {
        return { api_path: "GET changes", data: { id: 2177041, files } };
      },
    };

    const result = await getMergeRequestChangesWithFallback(client as never, "p", 73);
    const data = result.data as Record<string, unknown>;

    expect(data.changes).toEqual(files);
    expect(data.changes_count).toBe(2);
    expect(data.files).toEqual(files);
  });
});
