import type { Request, Response } from "express";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { OpenSearchClient } from "../client/opensearch.js";
import { createGraccMcpServer } from "../mcp/server.js";
import { ServerConfig } from "../types.js";

export const createHttpApp = (config: ServerConfig, client?: OpenSearchClient) => {
  const app = createMcpExpressApp({ host: config.httpHost });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createGraccMcpServer(config, client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error"
          },
          id: null
        });
      }
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  app.get("/mcp", async (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use HTTP POST for Streamable MCP requests."
      },
      id: null
    });
  });

  app.delete("/mcp", async (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. This server is read-only and stateless over HTTP."
      },
      id: null
    });
  });

  return app;
};
