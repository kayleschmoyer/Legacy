# Cloud-to-Local Teleport Handoff

## Session Info

- **Branch**: `claude/llm-cache-efficiency-PW43v`
- **Ticket**: none — research task on agent-research branch (no Jira ticket)
- **Cloud agent session**: 2026-04-07
- **Topic**: Data-driven evaluation of how this project uses Claude (prompts, skills, hooks, MCP servers, prompt-cache efficiency)

> **No secrets in this file.**

## Background

User asked: _"How well are we using Claude in this project?"_ and explicitly requested a **data-driven** evaluation with **no extrapolation**. The cloud agent did all the measurements that could be done from a sandboxed Linux environment with no network egress and no API key, then hit three hard environment boundaries that block the most valuable measurements.

## Completed Steps (cloud)

- [x] Inventoried always-on files: `AGENTS.md` (29,169 b / 218 lines), `CLAUDE.md` (246 b shim), `.claude/settings.json` (2,254 b)
- [x] Section-level breakdown of `AGENTS.md` — `## Workflow` (9,048 b) and `## Critical Rules` (7,862 b) are 58% of the file
- [x] Inventoried 26 skills under `.agents/skills/` — total skill body 274,676 b, total description text 6,902 chars
- [x] Ranked skill descriptions by char length — top offenders: `open-prs` (662), `work-ticket` (428), `cloud-teleport` (354), `mcp-gaps` (343), `terraform-local-apply` (334)
- [x] Counted 99 reference files under `.agents/skills/**/references/` (lazy-loaded, 673,372 b)
- [x] Counted 14 slash commands under `.claude/commands/` (15,971 b total)
- [x] Executed both hooks and captured stdout — `check-github-auth.sh` emits 223 b on this session because the `CLAUDE_CODE_REMOTE` guard didn't match; `guard-main-repo.sh` correctly silent (0 b)
- [x] Found `permissions.allow` ↔ `enabledMcpjsonServers` drift in `.claude/settings.json` — 3 servers (`legacy-sports-aws`, `worktree`, Atlassian plugin UUID) are whitelisted in `permissions.allow` but missing from `enabledMcpjsonServers`
- [x] Measured verbatim line-level duplication between `AGENTS.md` and skill files — only **7 of 132** long lines are verbatim duplicates (all in `cloud-agent-mode/SKILL.md`); topical duplication is larger but not mechanically quantifiable
- [x] **Retracted** previous-turn claim that `currentDate` is injected by the project harness — exhaustive search of repo + `~/.claude/` + `~/.config/` for the literal string `"Today's date is"` returned **0 hits**. The string appears only in 2 of my own assistant messages in the session JSONL. It's injected by Claude Code itself, not the project. Strike that bullet from the previous report.
- [x] Wrote a self-contained, re-runnable measurement script: **`.claude/measure-agent-harness.py`**

## Blocked Steps

| #   | Operation                                                                                                                                                                                                                                                                                                                                     | Why blocked in cloud                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Exact Claude token counts** for every always-on file (AGENTS.md sections, skill descriptions, slash commands, hook outputs)                                                                                                                                                                                                                 | `pip install tiktoken` blocked by sandbox proxy (`openaipublic.blob.core.windows.net` 403); no `ANTHROPIC_API_KEY` for `messages.count_tokens`                             |
| 2   | **MCP tool schema sizes** — for each of the 9 servers in `.mcp.json`, spawn it via `pnpm exec tsx`, call `tools/list`, and measure each tool's serialized schema size. This is the biggest unknown — these schemas are loaded on every session that doesn't use `ENABLE_TOOL_SEARCH` deferral, and we have **zero** data on their actual size | Cloud sandbox doesn't have project deps installed; spawning 9 long-running tsx processes is unreliable here                                                                |
| 3   | **Real per-session cache hit rate** from `~/.claude/projects/-home-user-legacy-sports/*.jsonl` `usage` blocks — the JSONL files exist on disk and likely contain `cache_creation_input_tokens` / `cache_read_input_tokens` per turn. Aggregating these gives ground-truth cache efficiency over real recent sessions                          | Reading is technically possible from cloud, but the data being measured _is the local user's session history_, which is far more complete and current on the local machine |

## Remaining Steps (local)

The local agent should run **one command** and then interpret the results:

```bash
# Optional but strongly recommended for ground-truth tokens:
export ANTHROPIC_API_KEY=...   # any working key — count_tokens is free

# Then:
python3 .claude/measure-agent-harness.py
```

This produces:

- `scratch/measure-agent-harness-data.json (gitignored output)` — structured raw data, diff-friendly across runs
- Stdout summary line with cache hit rate, MCP tool schema total, and always-on token total

The script auto-detects which tokenizer to use, in this order:

1. `ANTHROPIC_API_KEY` set → calls `client.messages.count_tokens` (ground truth, free, slow)
2. `tiktoken` installed → uses `cl100k_base` (close approximation, fast)
3. Neither → falls back to `chars/4` (clearly labeled `approx`)

The local agent should then:

1. **Read `scratch/measure-agent-harness-data.json (gitignored output)`**.
2. **Confirm `tokenizer_mode`** at the top — ideally `"anthropic-api"`. If `"approx"`, install tiktoken first (`pip install tiktoken`) and re-run; if still failing, set `ANTHROPIC_API_KEY` and re-run.
3. **Build a results table** ranking the heaviest items in the always-on context budget. The bullets in the previous-turn assistant message (sections 1, 2, 3, 5, 6, 7, 8) are the targets — replace every char/byte number with a real token number.
4. **Pay special attention to the new data:**
   - `mcp_tool_schemas.grand_total_tokens` → the previously-unknown number. If this is large (say > 10k tokens), it justifies `ENABLE_TOOL_SEARCH` and informs which MCP servers to refactor first (the `tools` array per server is sorted descending by schema size).
   - `session_usage.aggregate.cache_hit_rate` → the single most important metric in the entire report. This is the only ground-truth measurement of how cache-efficient the current setup _actually is_. A healthy harness should see >80%; if it's lower, we have a real problem to fix.
   - `session_usage.sessions[*]` → top 20 sessions by cache reads. If hit rate varies wildly across sessions, identify the low-hit-rate sessions and inspect their JSONLs to find what invalidated the cache.
5. **Report findings to the user** as a data-only update to the previous turn's analysis. No new opinions, no new extrapolations — just the numbers, ranked, with the previous turn's "I had only chars" caveats removed.

## Context for Local Agent

- **No code changes were made** in the cloud session. The branch is at `c2353a5` (clean working tree before the teleport commit). The only files added are `.claude/measure-agent-harness.py` and this handoff doc.
- **The user explicitly authorized reading session JSONLs** (turn before this one: _"I'm happy to provide the authorization you need"_). The script reads `~/.claude/projects/-home-user-legacy-sports/*.jsonl` — proceed.
- **Do NOT modify `AGENTS.md` or any skill files yet.** This research branch is for measurement only; any restructuring should happen on a separate branch with its own ticket so the slim can be A/B'd against the measured baseline.
- **Re-runnability matters.** The script writes JSON so that after any future change to AGENTS.md / skills / hooks / settings, you can re-run and diff the JSON to prove the change actually moved the numbers. Treat the JSON as the canonical baseline.

## Files Changed in Cloud Session

- `.claude/measure-agent-harness.py` — self-contained measurement script (8 sections, ~350 lines)
- `.claude/teleport-handoff.md` — this file

## Previous-Turn Numbers (cloud, byte/char only — NOT tokens)

For convenience when interpreting the script's output, here are the cloud-measured byte/line numbers so the local agent can sanity-check that nothing changed between sessions:

| Metric                                      | Value        |
| ------------------------------------------- | ------------ |
| `AGENTS.md` bytes / lines                   | 29,169 / 218 |
| `## Workflow` section bytes                 | 9,048        |
| `## Critical Rules` section bytes           | 7,862        |
| Skill count                                 | 26           |
| Total skill body bytes                      | 274,676      |
| Total skill description chars               | 6,902        |
| Largest skill description (open-prs)        | 662 chars    |
| Slash commands count / total bytes          | 14 / 15,971  |
| Hook stdout (check-github-auth, this env)   | 223 b        |
| MCP servers in `.mcp.json`                  | 9            |
| MCP servers enabled in `settings.json`      | 7            |
| `permissions.allow` entries                 | 34           |
| Verbatim AGENTS.md ↔ skills duplicate lines | 7 / 132      |

If any of these change after the local fetch + script run, that's interesting and worth a one-line note in the report.
