import { describe, expect, it } from "vitest";
import { buildGitEnv, resolveWorkspacePath } from "../src/services/git.js";
import type { GongfengConfig } from "../src/services/config.js";

const config: GongfengConfig = {
  apiBase: "https://git.code.tencent.com/api/v3",
  token: "token",
  sshKeyPath: "/home/user/.ssh/id_rsa",
  knownHostsPath: "/home/user/.ssh/known_hosts",
  workdir: "/tmp/gongfeng-work",
};

describe("git helpers", () => {
  it("constructs a constrained SSH command", () => {
    const env = buildGitEnv(config);
    expect(env.GIT_SSH_COMMAND).toContain("ssh -i '/home/user/.ssh/id_rsa'");
    expect(env.GIT_SSH_COMMAND).toContain("IdentitiesOnly=yes");
    expect(env.GIT_SSH_COMMAND).toContain("UserKnownHostsFile='/home/user/.ssh/known_hosts'");
  });

  it("keeps local paths inside GONGFENG_WORKDIR", () => {
    expect(resolveWorkspacePath(config, "repo")).toBe("/tmp/gongfeng-work/repo");
    expect(() => resolveWorkspacePath(config, "../escape")).toThrow(/GONGFENG_WORKDIR/);
  });
});
