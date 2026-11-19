import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config/env.js";
import { createGraccMcpServer } from "./mcp/server.js";

const main = async () => {
  const config = loadConfig();
  const server = createGraccMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
