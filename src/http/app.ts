import type { NextFunction, Request, Response } from "express";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { rateLimit } from "express-rate-limit";

import { OpenSearchClient } from "../client/opensearch.js";
import { createGraccMcpServer } from "../mcp/server.js";
import { ServerConfig } from "../types.js";

const jsonRpcError = (res: Response, status: number, code: number, message: string) => {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
};

export const createHttpApp = (config: ServerConfig, client?: OpenSearchClient) => {
  // One upstream client for the whole process so the cache, request
  // coalescing, and concurrency cap apply across all HTTP requests.
  const upstream = client ?? new OpenSearchClient(config);
  const app = createMcpExpressApp({ host: config.httpHost });

  // Needed behind an ingress so req.ip (and the rate limit key) is the real client.
  app.set("trust proxy", config.trustProxy);

  if (config.rateLimit.max > 0) {
    const windowSeconds = Math.round(config.rateLimit.windowMs / 1000);
    app.use(
      "/mcp",
      rateLimit({
        windowMs: config.rateLimit.windowMs,
        limit: config.rateLimit.max,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req: Request, res: Response, _next: NextFunction, options) => {
          jsonRpcError(
            res,
            options.statusCode,
            -32000,
            `Rate limit exceeded: at most ${config.rateLimit.max} requests per ${windowSeconds}s per client. Retry later.`
          );
        }
      })
    );
  }

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createGraccMcpServer(config, upstream);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        jsonRpcError(
          res,
          500,
          -32603,
          error instanceof Error ? error.message : "Internal server error"
        );
      }
    }
  });

  app.get("/mcp", async (_req: Request, res: Response) => {
    jsonRpcError(res, 405, -32000, "Method not allowed. Use HTTP POST for Streamable MCP requests.");
  });

  app.delete("/mcp", async (_req: Request, res: Response) => {
    jsonRpcError(
      res,
      405,
      -32000,
      "Method not allowed. This server is read-only and stateless over HTTP."
    );
  });

  return app;
};
