import { SourceNote } from "../types.js";

export const SOURCE_NOTES: SourceNote[] = [
  {
    label: "GRACC Direct Queries",
    url: "https://osg-htc.org/gracc/user/direct/",
    detail:
      "Documents the public read-only endpoint, the gracc.osg.summary index alias, and example aggregations over EndTime, CoreHours, and Njobs."
  },
  {
    label: "GRACC Message Queues",
    url: "https://osg-htc.org/gracc/dev-docs/message-queues/",
    detail:
      "Shows representative raw and summary record fields including VOName, ReportableVOName, WallDuration, CpuDuration, Processors, ResourceType, SiteName, and Grid."
  },
  {
    label: "GRACC Operations",
    url: "https://osg-htc.org/gracc/ops/services/",
    detail:
      "Confirms the public read-only query endpoint at https://gracc.opensciencegrid.org/q and that it is intended for limited unauthenticated public queries."
  }
];

export const KNOWN_ASSUMPTIONS = [
  "The documented index alias gracc.osg.summary is the only index this server queries by default.",
  "Public field mappings observed on 2026-04-22 showed backing summary indices such as gracc.osg.summary4-2024 through gracc.osg.summary4-2026. The server still targets the alias, not those backing indices directly.",
  "CoreHours is present in the public mappings, so the server uses it directly instead of deriving core hours from WallDuration and Processors.",
  "CpuDuration, CpuDuration_user, CpuDuration_system, WallDuration, Njobs, and Processors are treated as additive summary fields based on the public mappings and documentation examples.",
  "Project and site semantics may reflect GRACC correction and OIM enrichment stages rather than raw submitted values."
];

export const FIELD_CAVEATS = [
  "EndTime is the default time filter because the public GRACC docs use it in both curl and Python examples.",
  "@timestamp is exposed as an alternative time field because it appears in the public mappings, but its exact semantic role is ingest-oriented rather than job-end-oriented.",
  "Processor counts are reported as a sum of the Processors field across matching summary documents, not as a distinct inventory count.",
  "CommonName can be high-cardinality and sensitive from a privacy perspective even though the endpoint is public; clients should prefer higher-level dimensions when possible.",
  "Some legacy or non-gracc indices visible through field caps have different field types. This server intentionally avoids them."
];
