import * as z from "zod/v4";

import { assertAllowedIndex } from "../validation/common.js";
import { validateSafeQueryBody } from "../validation/safeQuery.js";
import { ToolContext } from "./shared.js";

export const runSafeQueryInputShape = {
  index: z.string().optional().describe("Optional allowlisted index. Defaults to gracc.osg.summary."),
  body: z
    .record(z.string(), z.unknown())
    .describe(
      "Constrained OpenSearch _search body. Supports only allowlisted fields, term/terms/range/bool filters, and safe aggregations."
    )
};

export const runSafeQueryOutputShape = {
  index: z.string(),
  took: z.number(),
  timed_out: z.boolean(),
  hits_total: z.number().optional(),
  hits_relation: z.string().optional(),
  hits: z.array(
    z.object({
      _id: z.string().optional(),
      _index: z.string().optional(),
      _source: z.record(z.string(), z.unknown()).optional()
    })
  ),
  aggregations: z.record(z.string(), z.unknown()).optional()
};

export const runSafeQuerySchema = z.object(runSafeQueryInputShape);

export const runSafeQuery = async (
  args: z.infer<typeof runSafeQuerySchema>,
  context: ToolContext
) => {
  const index = assertAllowedIndex(context.config, args.index);
  validateSafeQueryBody(args.body, context.config);

  const response = await context.client.search(index, args.body);
  const payload = {
    index,
    took: response.took,
    timed_out: response.timed_out,
    hits_total: response.hits.total?.value,
    hits_relation: response.hits.total?.relation,
    hits: response.hits.hits.map((hit) => ({
      _id: hit._id,
      _index: hit._index,
      _source: hit._source as Record<string, unknown> | undefined
    })),
    aggregations: response.aggregations
  };

  const byteLength = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (byteLength > context.config.safety.maxResultBytes) {
    throw new Error(
      `run_safe_query response was ${byteLength} bytes, exceeding the maximum of ${context.config.safety.maxResultBytes}. Reduce size or requested fields.`
    );
  }

  return payload;
};
