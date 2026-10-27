import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { GongfengConfig } from "./config.js";

const execFileAsync = promisify(execFile);

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildGitEnv(config: GongfengConfig): NodeJS.ProcessEnv {
  if (!config.sshKeyPath) return process.env;

  const parts = [
    "ssh",
    "-i",
    shellQuote(config.sshKeyPath),
    "-o",
    "IdentitiesOnly=yes",
  ];

  if (config.knownHostsPath) {
    parts.push("-o", `UserKnownHostsFile=${shellQuote(config.knownHostsPath)}`, "-o", "StrictHostKeyChecking=yes");
  }

  return {
    ...process.env,
    GIT_SSH_COMMAND: parts.join(" "),
  };
}

export function resolveWorkspacePath(config: GongfengConfig, requestedPath: string): string {
  const root = path.resolve(config.workdir);
  const resolved = path.resolve(root, requestedPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path "${requestedPath}" must stay inside GONGFENG_WORKDIR (${root}).`);
  }
  return resolved;
}

export class GitService {
  constructor(private readonly config: GongfengConfig) {}

  async cloneRepo(repoSshUrl: string, targetDir: string, options: { branch?: string; depth?: number } = {}) {
    const targetPath = resolveWorkspacePath(this.config, targetDir);
    const args = ["clone"];
    if (options.branch) args.push("--branch", options.branch);
    if (options.depth) args.push("--depth", String(options.depth));
    args.push(repoSshUrl, targetPath);
    const { stdout, stderr } = await execFileAsync("git", args, {
      env: buildGitEnv(this.config),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { target_path: targetPath, stdout, stderr };
  }

  async status(repoPath: string) {
    const cwd = resolveWorkspacePath(this.config, repoPath);
    const { stdout, stderr } = await execFileAsync("git", ["status", "--short", "--branch"], {
      cwd,
      env: buildGitEnv(this.config),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { repo_path: cwd, stdout, stderr };
  }

  async commitChanges(repoPath: string, message: string, paths: string[] = ["."]) {
    const cwd = resolveWorkspacePath(this.config, repoPath);
    await execFileAsync("git", ["add", "--", ...paths], {
      cwd,
      env: buildGitEnv(this.config),
      maxBuffer: 10 * 1024 * 1024,
    });
    const { stdout, stderr } = await execFileAsync("git", ["commit", "-m", message], {
      cwd,
      env: buildGitEnv(this.config),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { repo_path: cwd, stdout, stderr };
  }
}
