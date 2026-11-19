import * as z from "zod/v4";

import { FIELD_CAVEATS, KNOWN_ASSUMPTIONS, SOURCE_NOTES } from "../schema/notes.js";
import { ToolContext } from "./shared.js";

const observedMappingExcerpt = {
  "@timestamp": "date",
  EndTime: "date",
  VOName: "keyword",
  ReportableVOName: "keyword",
  ProjectName: "keyword",
  ResourceType: "keyword",
  CommonName: "keyword",
  SiteName: "keyword",
  OIM_Site: "keyword",
  OIM_ResourceGroup: "keyword",
  CoreHours: "double",
  CpuDuration: "double",
  CpuDuration_user: "double",
  CpuDuration_system: "double",
  Njobs: "float",
  Processors: "long",
  WallDuration: "long",
  GPUHours: "double",
  GPUs: "long"
};

export const getSchemaNotesInputShape = {
  include_sources: z
    .boolean()
    .optional()
    .describe("Include source URLs for the documented assumptions. Defaults to true.")
};

export const getSchemaNotesOutputShape = {
  verified_on: z.string(),
  default_index: z.string(),
  notes: z.array(z.string()),
  caveats: z.array(z.string()),
  observed_mapping_excerpt: z.record(z.string(), z.string()),
  sources: z.array(
    z.object({
      label: z.string(),
      url: z.string(),
      detail: z.string()
    })
  )
};

export const getSchemaNotesSchema = z.object(getSchemaNotesInputShape);

export const getSchemaNotes = async (
  args: z.infer<typeof getSchemaNotesSchema>,
  context: ToolContext
) => {
  return {
    verified_on: "2026-04-22",
    default_index: context.config.defaultIndex,
    notes: KNOWN_ASSUMPTIONS,
    caveats: FIELD_CAVEATS,
    observed_mapping_excerpt: observedMappingExcerpt,
    sources: args.include_sources === false ? [] : SOURCE_NOTES
  };
};
