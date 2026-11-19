# GRACC MCP Server

Read-only Model Context Protocol (MCP) server for GRACC, the OSG accounting system.

This server gives MCP-compatible AI clients safe access to public GRACC accounting data through the documented public OpenSearch-compatible endpoint:

- `https://gracc.opensciencegrid.org/q`

The implementation is intentionally conservative:

- read-only only
- default index alias `gracc.osg.summary`
- aggregation-first workflows
- hard validation and safety caps
- standards-compliant MCP tool definitions
- portable STDIO-first design, with optional Streamable HTTP

## What GRACC Is

GRACC is the Open Science Grid accounting system. It collects and summarizes usage data and exposes public read-only query access for analytics. The GRACC docs explicitly document the public query endpoint and show aggregation examples over fields such as `EndTime`, `VOName`, `ResourceType`, `CoreHours`, and `Njobs`.

## What This Server Does

This MCP server wraps a small, safe subset of that public query surface into model-friendly tools:

- `list_dimensions`
- `query_usage_summary`
- `top_n_entities`
- `time_series_usage`
- `get_schema_notes`
- `run_safe_query`

The server is designed for LLM tool use, not for raw admin access or dashboard mirroring.

## Supported Tools

### `list_dimensions`

Lists supported filter fields, grouping fields, date fields, and metrics.

Good first call for a client that needs to discover valid arguments before issuing analytical queries.

### `query_usage_summary`

Returns aggregate usage metrics over a required time range with optional exact-match filters.

Example use cases:

- total `core_hours` for `vo_name=ligo`
- total `job_count` for `resource_type=Payload`
- total `cpu_duration_seconds` for a project over a week

### `top_n_entities`

Ranks the top N values for a supported dimension using a selected metric.

Example use cases:

- top VOs by `core_hours`
- top projects by `job_count`
- top sites by `wall_duration_seconds`

### `time_series_usage`

Returns a date histogram over a required time range and metric.

Supported intervals:

- `day`
- `week`
- `month`

### `get_schema_notes`

Returns concise notes, caveats, and source references derived from public GRACC docs and observed public mappings.

### `run_safe_query`

Expert tool for constrained raw `_search` access. It can be turned off with `GRACC_ENABLE_SAFE_QUERY=false`.

The caller's JSON is never forwarded. The server validates each part and builds a fresh request from it, so any key it does not recognize is rejected rather than passed through to GRACC.

Requirements:

- `query` is required and must contain a `range` on `EndTime` or `@timestamp` with both a lower (`gte`/`gt`) and upper (`lt`/`lte`) bound, either as the top-level query or inside `bool.filter`. A range inside `must_not` does not count.
- The bounded range must be at most `GRACC_MAX_RANGE_DAYS` long.
- Date values must be strict ISO 8601 (`2026-04-01` or `2026-04-01T12:00:00Z`). Epoch numbers and date math such as `now-7d` are rejected.

It only allows:

- allowlisted index selection
- allowlisted fields (ids such as `vo_name` are resolved to field names such as `VOName`)
- `term`, `terms` (at most 25 values), `range`, and `bool` with `filter`/`must_not` (at most 3 levels deep, 32 clauses total)
- `terms` aggregations with `field`, `size` (at most `GRACC_MAX_TOP_N`), and `order` (`_count`, `_key`, or a child metric aggregation)
- `date_histogram` aggregations with `field` (a date field that has a bounded range in the query), `calendar_interval` (`day`, `week`, `month`), and `time_zone`
- `sum` (metric fields only) and `value_count` aggregations with `field`
- at most 10 aggregations, nested at most 2 deep, with an estimated total of at most 10,000 buckets
- `size` defaults to `0`; when hits are requested, `_source` is limited to allowlisted fields

It rejects:

- writes, updates, deletes, and endpoints other than `_search`
- scripts anywhere, including inside aggregations
- `query_string` and any other unsupported query operator
- aggregation options such as `extended_bounds`, `min_doc_count`, `shard_size`, `include`, `exclude`, and `missing`
- result payloads above `GRACC_MAX_RESULT_BYTES`

## Supported Indices

The server queries only this index alias by default:

- `gracc.osg.summary`

Observed public mappings on `2026-04-22` showed backing summary indices such as yearly `gracc.osg.summary4-*` indices, but the server intentionally targets the documented alias rather than those backing indices directly.

## Supported Fields And Metrics

Primary dimensions:

- `vo_name` -> `VOName`
- `reportable_vo_name` -> `ReportableVOName`
- `project_name` -> `ProjectName`
- `resource_type` -> `ResourceType`
- `common_name` -> `CommonName`
- `site_name` -> `SiteName`
- `oim_site` -> `OIM_Site`
- `resource_group` -> `OIM_ResourceGroup`
- `submit_host` -> `SubmitHost`
- `probe_name` -> `ProbeName`
- `end_time` -> `EndTime`
- `timestamp` -> `@timestamp`

Primary metrics:

- `job_count` -> sum of `Njobs`
- `core_hours` -> sum of `CoreHours`
- `wall_duration_seconds` -> sum of `WallDuration`
- `cpu_duration_seconds` -> sum of `CpuDuration`
- `cpu_user_seconds` -> sum of `CpuDuration_user`
- `cpu_system_seconds` -> sum of `CpuDuration_system`
- `processor_count_sum` -> sum of `Processors`
- `gpu_hours` -> sum of `GPUHours`
- `gpu_count_sum` -> sum of `GPUs`

## Setup

### Requirements

- Node.js `20.11+`
- npm `10+`

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

Optional live test against the public endpoint:

```bash
GRACC_LIVE_TESTS=1 npm run test:live
```

### Run Via STDIO

For local MCP clients that spawn the server as a subprocess:

```bash
npm run dev:stdio
```

Or after building:

```bash
npm run start:stdio
```

### Run Via HTTP

Optional stateless Streamable HTTP endpoint:

```bash
npm run dev:http
```

Or after building:

```bash
npm run start:http
```

Default URL:

- `http://127.0.0.1:3333/mcp`

### Docker Image

Build a container image that runs the MCP server in HTTP mode:

```bash
docker build -t ghcr.io/your-org/gracc-mcp-server:latest .
```

The container listens on:

- `3333` for native MCP Streamable HTTP

### GitHub Actions Docker Build

This repository includes a GitHub Actions workflow at `.github/workflows/docker.yml`.

It does two things:

- builds the Docker image on every push, pull request, and manual workflow run
- pushes the image to GitHub Container Registry on pushes to the default branch and on tag pushes

Published image name:

- `ghcr.io/<github-owner>/gracc-mcp-server`

Typical published tags include:

- `latest` on the default branch
- branch names
- version tags such as `v1.2.3`
- commit SHA tags

If you want Kubernetes to consume the GitHub Actions-built image, point the overlay image override at that GHCR package in [k8s/overlays/dev/kustomization.yaml](/Users/derekweitzel/git/gracc-mcp/k8s/overlays/dev/kustomization.yaml).

### Kubernetes With Kustomize

Kubernetes manifests live under:

- `k8s/base`
- `k8s/overlays/dev`

The deployment runs two containers in one pod:

- `gracc-mcp` on port `3333` for the native MCP endpoint
- `mcpo` on port `8000` as an MCP-to-OpenAPI bridge for Open WebUI and other OpenAPI clients

Build and push your image first:

```bash
docker build -t ghcr.io/your-org/gracc-mcp-server:latest .
docker push ghcr.io/your-org/gracc-mcp-server:latest
```

Then update the image override in [k8s/overlays/dev/kustomization.yaml](/Users/derekweitzel/git/gracc-mcp/k8s/overlays/dev/kustomization.yaml) and deploy:

```bash
kubectl apply -k k8s/overlays/dev
```

The deployment creates two cluster-internal services:

- `gracc-mcp:3333` -> native MCP endpoint at `/mcp`
- `gracc-mcp-openapi:8000` -> OpenAPI bridge with docs at `/docs`

In-cluster URLs:

- `http://gracc-mcp:3333/mcp`
- `http://gracc-mcp-openapi:8000/docs`

The bundled `mcpo` sidecar uses the Open WebUI-maintained MCP-to-OpenAPI proxy image:

- `ghcr.io/open-webui/mcpo:main`

If you need external access, add your own `Ingress`, `Gateway`, or service-type override in an overlay rather than changing the base manifests.

## Configuration

Copy `.env.example` to `.env` and adjust only if needed.

Important settings:

- `GRACC_BASE_URL`
- `GRACC_DEFAULT_INDEX`
- `GRACC_ALLOWED_INDICES`
- `GRACC_MAX_RANGE_DAYS`
- `GRACC_MAX_BUCKETS`
- `GRACC_MAX_TOP_N`
- `GRACC_MAX_SAFE_QUERY_SIZE`
- `GRACC_MAX_RESULT_BYTES`
- `GRACC_TIMEOUT_MS`
- `GRACC_RETRY_COUNT`
- `GRACC_HTTP_HOST`
- `GRACC_HTTP_PORT`

Public deployment settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRACC_ENABLE_SAFE_QUERY` | `true` | Register the expert `run_safe_query` tool. |
| `GRACC_TRUST_PROXY` | `false` | Express `trust proxy` value. Set to the number of proxy hops (usually `1` behind an ingress) so rate limits use the real client IP. Avoid `true`, which lets clients spoof `X-Forwarded-For`. |
| `GRACC_RATE_LIMIT_MAX` | `120` | HTTP requests per client IP per window. `0` disables rate limiting. |
| `GRACC_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window. |
| `GRACC_MAX_CONCURRENT_UPSTREAM` | `4` | Maximum simultaneous requests to GRACC per process. |
| `GRACC_MAX_QUEUED_UPSTREAM` | `32` | Requests allowed to wait for a slot; beyond this the tool returns a "busy" error. |
| `GRACC_MAX_UPSTREAM_BYTES` | `1048576` | Largest GRACC response the server will read. |
| `GRACC_CACHE_TTL_SECONDS` | `300` | How long identical queries are served from memory. `0` disables the cache. |
| `GRACC_CACHE_MAX_BYTES` | `33554432` | Memory budget for the response cache. |

Rate limits, the cache, and the concurrency cap are per process, so with N replicas GRACC can see up to N × `GRACC_MAX_CONCURRENT_UPSTREAM` concurrent requests. If the server sits behind a gateway that does not forward client IPs, every request shares one rate limit bucket. In that case, raise `GRACC_RATE_LIMIT_MAX` or set it to `0` and limit at the gateway.

## Safety Model

This server is intentionally read-only.

Core protections:

- only `_search` is used
- default index allowlist is explicit
- no write or admin APIs are implemented
- required date ranges for analytical tools, in strict ISO 8601 and converted to UTC before they are sent upstream, so JavaScript and OpenSearch cannot disagree about what a date means
- hard caps on date range, bucket count, top N, and raw query size
- exact-match filters only in normal tools
- `run_safe_query` builds a fresh request from validated parts instead of forwarding the caller's JSON
- per-IP rate limiting on the HTTP endpoint
- a process-wide cap on concurrent GRACC requests, with a bounded wait queue
- identical concurrent queries share one GRACC request, and successful responses are cached briefly
- GRACC responses are read with a byte cap
- request timeout; only connection failures and 429/502/503/504 responses are retried, with backoff. Query errors and timeouts are not retried, and a `Retry-After` longer than 5 seconds is not waited out
- result payload size cap for `run_safe_query`

## Known Assumptions And Field Caveats

### Known assumptions

- `gracc.osg.summary` is the authoritative public alias used by this server.
- `EndTime` is the default time field because it is used in the public GRACC direct-query examples.
- `CoreHours` is used directly from the public mapping instead of being derived.
- `ProjectName`, `ReportableVOName`, `OIM_Site`, and related fields may already reflect GRACC correction and enrichment stages.

### Field caveats

- `@timestamp` is available from the public mappings but appears to be ingest-oriented, not job-end-oriented.
- `processor_count_sum` is a sum of `Processors` across matching summary documents, not a distinct hardware inventory count.
- `CommonName` may be high-cardinality and is often less useful for broad analytics than VO, project, or site fields.
- Public field caps showed some legacy non-`gracc` indices with different field types; this server avoids them.

### TODOs and verification notes

- TODO: Confirm whether `CommonName` is the best default “submitter” dimension for every downstream client use case. Verify by inspecting GRACC dashboards or comparing with site stakeholder expectations.
- TODO: Confirm whether additional dimensions like `PayloadSiteName` or `ExecutePool` should be promoted into the initial allowlist. Verify by checking current public dashboards or usage examples.
- TODO: If future public docs standardize alternate summary aliases, update `GRACC_ALLOWED_INDICES` and the schema registry together rather than expanding query freedom ad hoc.

## Client Compatibility Notes

### MCP-standard behavior

These parts are portable across MCP-compatible clients:

- tool registration and schemas
- STDIO transport
- Streamable HTTP transport
- JSON result formatting
- read-only tool behavior

The core server does not depend on Codex-only APIs or prompt conventions.

### Client-specific examples

These are examples only:

- `examples/codex/config.toml`
- `examples/claude-desktop-config.json`
- `examples/prompts.md`
- `k8s/` deployment manifests

Different clients may vary in:

- tool-calling frequency
- schema strictness
- argument coercion
- error rendering
- support for STDIO vs HTTP transports

To stay portable, this server favors:

- explicit required dates
- small enums
- flat JSON outputs
- exact-match filters
- conservative errors

## Codex Configuration Example

Sample `.codex/config.toml` snippet:

```toml
[mcp_servers.gracc]
command = "node"
args = ["/absolute/path/to/gracc-mcp/dist/index.js"]
cwd = "/absolute/path/to/gracc-mcp"
```

See `examples/codex/config.toml` for a fuller example.

## Other MCP Client Notes

### Claude Desktop

See `examples/claude-desktop-config.json` for a STDIO registration example.

### ChatGPT Or Other MCP-Compatible Clients

Use either:

- STDIO mode pointing to `dist/index.js`
- Streamable HTTP mode pointing to `http://127.0.0.1:3333/mcp`

If a client has strict schema handling, prefer calling `list_dimensions` first and pass only the returned ids.

## Project Layout

```text
.
├── .dockerignore
├── AGENTS.md
├── Dockerfile
├── README.md
├── examples/
│   ├── claude-desktop-config.json
│   ├── codex/
│   │   └── config.toml
│   └── prompts.md
├── k8s/
│   ├── base/
│   └── overlays/
├── src/
│   ├── client/
│   ├── config/
│   ├── http/
│   ├── mcp/
│   ├── query/
│   ├── schema/
│   ├── tools/
│   ├── utils/
│   ├── validation/
│   ├── http-server.ts
│   └── index.ts
└── tests/
    ├── fixtures/
    ├── integration/
    ├── live/
    └── unit/
```

## Sources

- [GRACC Direct Queries](https://osg-htc.org/gracc/user/direct/)
- [GRACC Message Queues](https://osg-htc.org/gracc/dev-docs/message-queues/)
- [GRACC Operations](https://osg-htc.org/gracc/ops/services/)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
