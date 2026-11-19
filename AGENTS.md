# AGENTS.md

## Project Purpose

This repository implements a production-minded, read-only MCP server for the public GRACC accounting query endpoint.

Primary goal:

- expose safe GRACC analytics tools to MCP-compatible AI clients

Non-goals:

- no writes
- no admin APIs
- no reindexing
- no replay
- no dashboard scraping

## Allowed Endpoint

- `https://gracc.opensciencegrid.org/q`

Do not add private GRACC infrastructure or undocumented write endpoints without explicit user approval.

## Read-Only Rule

Every code path must remain read-only.

Allowed:

- `_search`
- aggregation queries
- field discovery already embedded in the schema registry and docs

Not allowed:

- `_bulk`
- `_update`
- `_delete`
- `_reindex`
- `_scripts`
- cluster-admin APIs
- any endpoint that mutates data or configuration

## Supported Indices

Current default and allowlisted index:

- `gracc.osg.summary`

Observed public backing indices were seen during development, but the code should continue using the documented alias unless a deliberate schema update is made.

## Supported Fields

Primary dimensions:

- `VOName`
- `ReportableVOName`
- `ProjectName`
- `ResourceType`
- `CommonName`
- `SiteName`
- `OIM_Site`
- `OIM_ResourceGroup`
- `SubmitHost`
- `ProbeName`
- `EndTime`
- `@timestamp`

Primary metrics:

- `Njobs`
- `CoreHours`
- `WallDuration`
- `CpuDuration`
- `CpuDuration_user`
- `CpuDuration_system`
- `Processors`
- `GPUHours`
- `GPUs`

## Coding Standards

- Keep the core server vendor-neutral.
- Prefer explicit validation over flexible query pass-through.
- Prefer flat, model-friendly JSON outputs.
- Require time ranges for analytical tools.
- Keep tool schemas simple and stable.
- Keep comments short and only where needed.
- Do not log secrets or large raw query bodies.
- When uncertain about a field, document the uncertainty instead of guessing.

## Test And Lint Commands

```bash
npm run lint
npm run test
GRACC_LIVE_TESTS=1 npm run test:live
```

## How To Safely Extend The Schema Registry

When adding a new dimension or metric:

1. Verify it exists in public docs, public mappings, or both.
2. Add it to `src/schema/registry.ts`.
3. Add any caveat to `src/schema/notes.ts`.
4. Decide whether it is filterable, groupable, or metric-only.
5. Update validation allowlists if needed.
6. Add or update unit tests.
7. Update README and this file if the addition changes the supported public contract.

## Tool Design Rules

- `list_dimensions` should remain discovery-oriented and side-effect free.
- `query_usage_summary`, `top_n_entities`, and `time_series_usage` should never accept arbitrary query DSL.
- `run_safe_query` must remain strictly constrained and should be treated as an expert escape hatch, not the default interface.

## Transport Rules

- STDIO support is required.
- HTTP support is optional but should stay standards-oriented and stateless unless there is a strong reason otherwise.
- Client-specific config belongs in `examples/`, not in the core server code.
