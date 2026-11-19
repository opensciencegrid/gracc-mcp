import { DimensionDefinition, MetricDefinition } from "../types.js";

export const SUPPORTED_DATE_FIELDS = {
  end_time: "EndTime",
  timestamp: "@timestamp"
} as const;

export type DateFieldId = keyof typeof SUPPORTED_DATE_FIELDS;

export const DIMENSIONS: DimensionDefinition[] = [
  {
    id: "vo_name",
    field: "VOName",
    label: "VO Name",
    description: "Primary VO identifier used in documented GRACC examples.",
    category: "organization",
    valueType: "keyword",
    aliases: ["VOName", "vo", "voname"],
    filterable: true,
    groupable: true,
    exampleValues: ["ligo", "cms", "osg"],
    notes: ["Values may reflect corrections already applied during summarization."]
  },
  {
    id: "reportable_vo_name",
    field: "ReportableVOName",
    label: "Reportable VO Name",
    description: "Reportable VO name used for downstream reporting and corrections.",
    category: "organization",
    valueType: "keyword",
    aliases: ["ReportableVOName", "reportable_vo", "reportablevo"],
    filterable: true,
    groupable: true,
    exampleValues: ["ligo", "cms", "osg"]
  },
  {
    id: "project_name",
    field: "ProjectName",
    label: "Project Name",
    description: "Project name after GRACC project enrichment and corrections.",
    category: "organization",
    valueType: "keyword",
    aliases: ["ProjectName", "project"],
    filterable: true,
    groupable: true,
    exampleValues: ["OSG-Staff", "SWC-OSG-IU15"],
    notes: ["Project semantics can depend on OIM enrichment."]
  },
  {
    id: "resource_type",
    field: "ResourceType",
    label: "Resource Type",
    description: "Resource classification such as payload or batch style usage.",
    category: "resource",
    valueType: "keyword",
    aliases: ["ResourceType", "resource"],
    filterable: true,
    groupable: true,
    exampleValues: ["Payload", "Batch"]
  },
  {
    id: "common_name",
    field: "CommonName",
    label: "Common Name",
    description: "Certificate common name or reporting identity grouped in summary records.",
    category: "identity",
    valueType: "keyword",
    aliases: ["CommonName", "submitter", "user"],
    filterable: true,
    groupable: true
  },
  {
    id: "site_name",
    field: "SiteName",
    label: "Site Name",
    description: "Site identifier present in summary records.",
    category: "resource",
    valueType: "keyword",
    aliases: ["SiteName", "site"],
    filterable: true,
    groupable: true,
    exampleValues: ["CHTC-AP41", "LIGO-CIT", "GPGRID"]
  },
  {
    id: "oim_site",
    field: "OIM_Site",
    label: "OIM Site",
    description: "Site name after OIM enrichment when available.",
    category: "resource",
    valueType: "keyword",
    aliases: ["OIM_Site", "oim_site"],
    filterable: true,
    groupable: true,
    exampleValues: ["Utah CHPC", "CHTC", "FermiGrid"]
  },
  {
    id: "resource_group",
    field: "OIM_ResourceGroup",
    label: "OIM Resource Group",
    description: "Resource group from OIM enrichment.",
    category: "resource",
    valueType: "keyword",
    aliases: ["OIM_ResourceGroup", "resource_group"],
    filterable: true,
    groupable: true,
    exampleValues: ["MWT2", "GPGRID", "CHTC"]
  },
  {
    id: "submit_host",
    field: "SubmitHost",
    label: "Submit Host",
    description: "Submit host field from summarized job records.",
    category: "identity",
    valueType: "keyword",
    aliases: ["SubmitHost", "submit_host"],
    filterable: true,
    groupable: true
  },
  {
    id: "probe_name",
    field: "ProbeName",
    label: "Probe Name",
    description: "Probe or collector name present in summarized usage records.",
    category: "resource",
    valueType: "keyword",
    aliases: ["ProbeName", "probe"],
    filterable: true,
    groupable: true
  },
  {
    id: "end_time",
    field: "EndTime",
    label: "End Time",
    description: "Documented primary time field used in GRACC examples and default date filtering.",
    category: "time",
    valueType: "date",
    aliases: ["EndTime", "date", "time"],
    filterable: true,
    groupable: true
  },
  {
    id: "timestamp",
    field: "@timestamp",
    label: "Document Timestamp",
    description: "Ingest timestamp observed in mappings; useful when comparing event ingestion time.",
    category: "time",
    valueType: "date",
    aliases: ["@timestamp", "timestamp"],
    filterable: true,
    groupable: true
  }
];

export const METRICS: MetricDefinition[] = [
  {
    id: "job_count",
    field: "Njobs",
    label: "Job Count",
    description: "Sum of the summarized job counter field.",
    unit: "jobs",
    aggregation: "sum",
    aliases: ["jobs", "Njobs", "jobcount"]
  },
  {
    id: "core_hours",
    field: "CoreHours",
    label: "Core Hours",
    description: "Sum of GRACC CoreHours from summary records.",
    unit: "core-hours",
    aggregation: "sum",
    aliases: ["CoreHours", "walltime", "corehours"]
  },
  {
    id: "wall_duration_seconds",
    field: "WallDuration",
    label: "Wall Duration",
    description: "Sum of wall duration values from summary records.",
    unit: "seconds",
    aggregation: "sum",
    aliases: ["WallDuration", "wall_duration", "wall_seconds"]
  },
  {
    id: "cpu_duration_seconds",
    field: "CpuDuration",
    label: "CPU Duration",
    description: "Sum of total CPU duration values from summary records.",
    unit: "seconds",
    aggregation: "sum",
    aliases: ["CpuDuration", "cpu_duration", "cpu_seconds"]
  },
  {
    id: "cpu_user_seconds",
    field: "CpuDuration_user",
    label: "CPU User Duration",
    description: "Sum of user CPU duration values from summary records.",
    unit: "seconds",
    aggregation: "sum",
    aliases: ["CpuDuration_user", "cpu_user"]
  },
  {
    id: "cpu_system_seconds",
    field: "CpuDuration_system",
    label: "CPU System Duration",
    description: "Sum of system CPU duration values from summary records.",
    unit: "seconds",
    aggregation: "sum",
    aliases: ["CpuDuration_system", "cpu_system"]
  },
  {
    id: "processor_count_sum",
    field: "Processors",
    label: "Processor Count Sum",
    description: "Sum of the Processors field across matching summary documents.",
    unit: "processors",
    aggregation: "sum",
    aliases: ["Processors", "processor_count", "processors"]
  },
  {
    id: "gpu_hours",
    field: "GPUHours",
    label: "GPU Hours",
    description: "Sum of GPUHours where present in the summary mapping.",
    unit: "gpu-hours",
    aggregation: "sum",
    aliases: ["GPUHours", "gpu_hours"]
  },
  {
    id: "gpu_count_sum",
    field: "GPUs",
    label: "GPU Count Sum",
    description: "Sum of the GPUs field across matching summary documents.",
    unit: "gpus",
    aggregation: "sum",
    aliases: ["GPUs", "gpu_count", "gpus"]
  }
];

const dimensionLookup = new Map<string, DimensionDefinition>();
const metricLookup = new Map<string, MetricDefinition>();

for (const dimension of DIMENSIONS) {
  for (const key of [dimension.id, dimension.field, ...dimension.aliases]) {
    dimensionLookup.set(key.toLowerCase(), dimension);
  }
}

for (const metric of METRICS) {
  for (const key of [metric.id, metric.field ?? "", ...metric.aliases]) {
    if (key) {
      metricLookup.set(key.toLowerCase(), metric);
    }
  }
}

export const resolveDimension = (value: string): DimensionDefinition | undefined => {
  return dimensionLookup.get(value.toLowerCase());
};

export const resolveMetric = (value: string): MetricDefinition | undefined => {
  return metricLookup.get(value.toLowerCase());
};

export const listFilterableDimensions = (): DimensionDefinition[] => {
  return DIMENSIONS.filter((dimension) => dimension.filterable);
};

export const listGroupableDimensions = (): DimensionDefinition[] => {
  return DIMENSIONS.filter((dimension) => dimension.groupable);
};

export const listSelectableMetrics = (): MetricDefinition[] => {
  return METRICS;
};
