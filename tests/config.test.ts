import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/services/config.js";

describe("config", () => {
  it("normalizes base host to /api/v3", () => {
    expect(loadConfig({ GONGFENG_API_BASE: "https://git.code.tencent.com" }).apiBase).toBe("https://git.code.tencent.com/api/v3");
  });

  it("keeps an explicit api v3 URL and accepts compatibility token env", () => {
    const config = loadConfig({
      GONGFENG_API_URL: "https://git.code.tencent.com/api/v3/",
      GONGFENG_ACCESS_TOKEN: "token",
      GONGFENG_WORKDIR: "/tmp/gongfeng",
    });
    expect(config.apiBase).toBe("https://git.code.tencent.com/api/v3");
    expect(config.token).toBe("token");
    expect(config.workdir).toBe("/tmp/gongfeng");
  });
});
