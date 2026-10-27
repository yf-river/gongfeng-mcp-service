import path from "node:path";
import { DEFAULT_API_BASE, DEFAULT_WORKDIR } from "../constants.js";

export interface GongfengConfig {
  apiBase: string;
  token?: string;
  sshKeyPath?: string;
  knownHostsPath?: string;
  workdir: string;
}

function normalizeApiBase(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/api/v3`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GongfengConfig {
  const apiBase = normalizeApiBase(
    env.GONGFENG_API_BASE ?? env.GONGFENG_API_URL ?? DEFAULT_API_BASE,
  );

  return {
    apiBase,
    token: env.GONGFENG_PRIVATE_TOKEN ?? env.GONGFENG_ACCESS_TOKEN,
    sshKeyPath: env.GONGFENG_SSH_KEY_PATH,
    knownHostsPath: env.GONGFENG_KNOWN_HOSTS_PATH,
    workdir: path.resolve(env.GONGFENG_WORKDIR ?? DEFAULT_WORKDIR),
  };
}

export function requireToken(config: GongfengConfig): string {
  if (!config.token) {
    throw new Error(
      "GONGFENG_PRIVATE_TOKEN is required for Gongfeng API tools. Set it to a personal access token.",
    );
  }
  return config.token;
}
