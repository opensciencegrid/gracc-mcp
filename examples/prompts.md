# Sample Prompts

Use these after registering the server in an MCP-compatible client.

## Discovery

- `Use list_dimensions and tell me which fields I can safely filter and group by in GRACC.`
- `Use get_schema_notes and summarize the main field caveats in plain English.`

## Summaries

- `Using query_usage_summary, show total core hours and job count for vo_name=ligo from 2026-04-01 to 2026-04-08.`
- `Using query_usage_summary, summarize cpu_duration_seconds and wall_duration_seconds for project_name=OSG-Staff for the last full month.`

## Top N

- `Using top_n_entities, rank the top 10 project_name values by core_hours from 2026-04-01 to 2026-04-30.`
- `Using top_n_entities, show the top 5 site_name values by job_count for vo_name=osg during 2026-04-01 through 2026-04-08.`

## Time Series

- `Using time_series_usage, return a daily core_hours series for vo_name=cms from 2026-04-01 to 2026-04-15.`
- `Using time_series_usage, return a weekly job_count series for resource_type=Payload in March 2026.`

## Expert Query

- `Use run_safe_query to execute a constrained aggregation-only query for sum(Njobs) and sum(CoreHours) over EndTime in the first week of April 2026.`
