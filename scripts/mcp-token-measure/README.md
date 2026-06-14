# MCP response token-measurement harness

> Ticket: **LS-8020** · Epic: **LS-8018 — Migrate MCP tool responses to token-efficient output formats**

A repeatable way to measure the token cost of an MCP tool response, so each
per-server migration (LS-8021…LS-8030) is decided on **measured numbers, not
priors**, and can record before/after deltas in its PR.

For any captured response payload it reports the cost of three encodings:

- **pretty JSON** — `JSON.stringify(payload, null, 2)` (today's default for most tools)
- **minified JSON** — `JSON.stringify(payload)` (cheapest lossless JSON)
- **Markdown table** — list-shaped arrays become tables (column headers written
  once instead of repeating keys per row); scalars/nested objects stay compact

This mirrors the epic's guiding principle: format choice is **per-response-shape**
— flat uniform lists win big as tables, while single objects / deeply nested data
are usually cheapest as minified JSON.

## Usage

```bash
# Measure the bundled fixtures (high-traffic tools)
node scripts/mcp-token-measure/measure.mjs

# Measure a payload you captured from a tool
node scripts/mcp-token-measure/measure.mjs path/to/response.json

# Machine-readable output (for scripting / CI)
node scripts/mcp-token-measure/measure.mjs --json

# Authoritative counts via the Claude API (needs ANTHROPIC_API_KEY)
node scripts/mcp-token-measure/measure.mjs --backend=anthropic

# Sanity checks
node scripts/mcp-token-measure/measure.mjs --selftest
```

Example output:

```
## github_pr_dashboard

| Encoding | Chars | Bytes | Tokens | Δ vs pretty |
| --- | ---: | ---: | ---: | ---: |
| pretty JSON | 4137 | 4139 | 1734 | — |
| minified JSON | 3128 | 3130 | 1336 | -23.0% |
| Markdown table | 2530 | 2532 | 1026 | -40.8% |
```

## Token backends

| Backend            | Flag                  | Needs                            | Use for                                    |
| ------------------ | --------------------- | -------------------------------- | ------------------------------------------ |
| estimate (default) | _(none)_              | nothing — offline, deterministic | CI, quick relative before/after comparison |
| anthropic          | `--backend=anthropic` | `ANTHROPIC_API_KEY` + network    | exact, citable numbers in a PR             |

The default **estimate** backend is a dependency-free BPE approximation
(`lib/tokenize.mjs`). It mirrors the pre-tokenization step shared by modern BPE
tokenizers (cl100k_base / o200k_base) — splitting text into word / number /
symbol / whitespace runs and approximating sub-word counts. It is good enough to
**rank** encodings and compute relative deltas (it consistently scores pretty >
minified > table for list payloads), but it is an approximation. When a migration
PR needs exact numbers, re-run with `--backend=anthropic`.

## Recording before/after deltas in a migration PR

1. Capture a representative response from the tool you're migrating (paste the
   tool's JSON output into a file under `fixtures/` or a scratch file).
2. Run the harness on it **before** changing the tool to get the baseline:
   ```bash
   node scripts/mcp-token-measure/measure.mjs fixtures/<tool>.json
   ```
3. Migrate the tool's response format (per LS-8019's standard + helper).
4. Capture the **after** payload and run the harness again.
5. Paste the before/after tables into the PR description. The `Δ vs pretty`
   column is the headline number; cite the absolute token counts too.

## Fixtures

`fixtures/` holds representative responses captured from high-traffic tools:

| Fixture                    | Source tool           | Server        |
| -------------------------- | --------------------- | ------------- |
| `github_pr_dashboard.json` | `github_pr_dashboard` | github-server |
| `ci_list_runs.json`        | `ci_list_runs`        | ci-server     |
| `jira_search.json`         | `jira_search`         | jira-server   |

Add more as each per-server ticket captures its own high-traffic tool responses.

## Files

- `measure.mjs` — CLI entry point
- `lib/tokenize.mjs` — token backends (offline estimate + Anthropic exact)
- `lib/encodings.mjs` — the three encoders (pretty / minified JSON, Markdown table)
- `fixtures/*.json` — representative captured payloads
