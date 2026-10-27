import { describe, expect, it } from "vitest";
import { encodeProjectId, requireExactConfirmation } from "../src/services/security.js";

describe("security helpers", () => {
  it("URL encodes project paths", () => {
    expect(encodeProjectId("group/subgroup/repo")).toBe("group%2Fsubgroup%2Frepo");
    expect(encodeProjectId(123)).toBe("123");
  });

  it("requires exact destructive confirmation", () => {
    expect(() => requireExactConfirmation("release/v1", "release/v1", "branch")).not.toThrow();
    expect(() => requireExactConfirmation("release", "release/v1", "branch")).toThrow(/confirm_target/);
  });
});
