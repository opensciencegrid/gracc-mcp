import * as z from "zod/v4";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { OpenSearchClient } from "../client/opensearch.js";
import { ServerConfig } from "../types.js";
import { toErrorToolResult, toStructuredToolResult } from "../utils/result.js";
import { getSchemaNotes, getSchemaNotesInputShape, getSchemaNotesOutputShape, getSchemaNotesSchema } from "../tools/getSchemaNotes.js";
import { listDimensions, listDimensionsInputShape, listDimensionsOutputShape, listDimensionsSchema } from "../tools/listDimensions.js";
import { queryUsageSummary, queryUsageSummaryInputShape, queryUsageSummaryOutputShape, queryUsageSummarySchema } from "../tools/queryUsageSummary.js";
import { runSafeQuery, runSafeQueryInputShape, runSafeQueryOutputShape, runSafeQuerySchema } from "../tools/runSafeQuery.js";
import { ToolContext } from "../tools/shared.js";
import { timeSeriesUsage, timeSeriesUsageInputShape, timeSeriesUsageOutputShape, timeSeriesUsageSchema } from "../tools/timeSeriesUsage.js";
import { topNEntities, topNEntitiesInputShape, topNEntitiesOutputShape, topNEntitiesSchema } from "../tools/topNEntities.js";

const createToolContext = (config: ServerConfig, client?: OpenSearchClient): ToolContext => ({
  config,
  client: client ?? new OpenSearchClient(config)
});

const withErrorBoundary = <TArgs extends z.ZodTypeAny, TResult extends Record<string, unknown>>(
  schema: TArgs,
  handler: (args: z.infer<TArgs>, context: ToolContext) => Promise<TResult>,
  context: ToolContext
) => {
  return async (rawArgs: unknown) => {
    try {
      const args = schema.parse(rawArgs);
      const result = await handler(args, context);
      return toStructuredToolResult(result);
    } catch (error) {
      return toErrorToolResult(error instanceof Error ? error.message : "Unknown tool error.");
    }
  };
};

export const createGraccMcpServer = (config: ServerConfig, client?: OpenSearchClient) => {
  const context = createToolContext(config, client);
  const server = new McpServer(
    {
      name: "gracc-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  server.registerTool(
    "list_dimensions",
    {
      title: "List Supported Dimensions",
      description:
        "Return the supported GRACC filter fields, grouping fields, date fields, and metrics. Example: call this first to discover valid dimension ids before using top_n_entities or query_usage_summary.",
      inputSchema: listDimensionsInputShape,
      outputSchema: listDimensionsOutputShape
    },
    withErrorBoundary(listDimensionsSchema, listDimensions, context)
  );

  server.registerTool(
    "query_usage_summary",
    {
      title: "Query Usage Summary",
      description:
        "Return aggregate GRACC usage metrics over a required time range with optional exact-match filters. Example filters: {\"vo_name\":\"ligo\",\"resource_type\":\"Payload\"}.",
      inputSchema: queryUsageSummaryInputShape,
      outputSchema: queryUsageSummaryOutputShape
    },
    withErrorBoundary(queryUsageSummarySchema, queryUsageSummary, context)
  );

  server.registerTool(
    "top_n_entities",
    {
      title: "Top N Entities",
      description:
        "Return the top N values for a supported grouping dimension ranked by a selected metric. Example: top project_name values by core_hours for April 2026.",
      inputSchema: topNEntitiesInputShape,
      outputSchema: topNEntitiesOutputShape
    },
    withErrorBoundary(topNEntitiesSchema, topNEntities, context)
  );

  server.registerTool(
    "time_series_usage",
    {
      title: "Time Series Usage",
      description:
        "Return a date histogram over a required time range for a selected metric. Supported intervals are day, week, and month.",
      inputSchema: timeSeriesUsageInputShape,
      outputSchema: timeSeriesUsageOutputShape
    },
    withErrorBoundary(timeSeriesUsageSchema, timeSeriesUsage, context)
  );

  server.registerTool(
    "get_schema_notes",
    {
      title: "Get Schema Notes",
      description:
        "Return concise field guidance, source references, and known caveats derived from GRACC public docs and observed public mappings.",
      inputSchema: getSchemaNotesInputShape,
      outputSchema: getSchemaNotesOutputShape
    },
    withErrorBoundary(getSchemaNotesSchema, getSchemaNotes, context)
  );

  server.registerTool(
    "run_safe_query",
    {
      title: "Run Safe Query",
      description:
        "Expert-only constrained raw _search access. Only allowlisted fields, filters, and aggregation types are accepted; scripts, writes, updates, and unsupported endpoints are rejected.",
      inputSchema: runSafeQueryInputShape,
      outputSchema: runSafeQueryOutputShape
    },
    withErrorBoundary(runSafeQuerySchema, runSafeQuery, context)
  );

  return server;
};
