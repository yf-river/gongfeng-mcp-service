#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { loadConfig, type GongfengConfig } from "./services/config.js";
import { GongfengClient } from "./services/api-client.js";
import { GitService } from "./services/git.js";
import { registerBranchTools } from "./tools/branches.js";
import { registerFileTools } from "./tools/files.js";
import { registerMergeRequestTools } from "./tools/merge-requests.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerTagTools } from "./tools/tags.js";
import type { ToolContext } from "./tools/shared.js";

export function createServer(config: GongfengConfig = loadConfig()): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const context: ToolContext = {
    client: new GongfengClient(config),
    git: new GitService(config),
  };

  registerFileTools(server, context);
  registerBranchTools(server, context);
  registerTagTools(server, context);
  registerMergeRequestTools(server, context);
  registerReviewTools(server, context);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`gongfeng-mcp-server failed: ${message}\n`);
    process.exit(1);
  });
}
