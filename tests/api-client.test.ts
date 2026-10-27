import { describe, expect, it } from "vitest";
import { GongfengApiError, GongfengClient } from "../src/services/api-client.js";
import type { GongfengConfig } from "../src/services/config.js";

const config: GongfengConfig = {
  apiBase: "https://git.code.tencent.com/api/v3",
  token: "token",
  workdir: "/tmp",
};

describe("GongfengClient", () => {
  it("adds PRIVATE-TOKEN, query params, and pagination metadata", async () => {
    let capturedUrl = "";
    let capturedToken = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedToken = new Headers(init?.headers).get("PRIVATE-TOKEN") ?? "";
      return new Response(JSON.stringify([{ name: "main" }]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Total": "30",
          "X-Total-Pages": "2",
          "X-Page": "1",
          "X-Per-Page": "20",
          "X-Next-Page": "2",
        },
      });
    };

    const client = new GongfengClient(config, fetchImpl);
    const result = await client.get("projects/group%2Frepo/repository/branches", { page: 1, per_page: 20 });

    expect(capturedUrl).toBe("https://git.code.tencent.com/api/v3/projects/group%2Frepo/repository/branches?page=1&per_page=20");
    expect(capturedToken).toBe("token");
    expect(result.pagination).toMatchObject({ total: 30, total_pages: 2, page: 1, per_page: 20, next_page: 2, has_more: true });
  });

  it("maps API failures into actionable errors", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "bad token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const client = new GongfengClient(config, fetchImpl);
    await expect(client.get("projects")).rejects.toThrow(GongfengApiError);
    await expect(client.get("projects")).rejects.toThrow(/Unauthorized/);
  });
});
