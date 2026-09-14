---
name: tool-economy
description: 'How to use the available tools economically — batching calls into one turn, reading narrowly, offloading bulk reads, and preferring in-turn waits. Load when a session is burning context faster than it is making progress, or before a long read-heavy pass (self-review, audits, sweeps).'
---

# Tool Economy

> **Sibling to [Tool-First Concrete Substitutions](../SKILL.md#tool-first-concrete-substitutions).** That section answers _which_ tool is correct. This one answers _how many times to call it_. Correct-but-serial tool use is the single largest avoidable token cost in a long session.

## The arithmetic

Every assistant turn re-sends the entire conversation context. Ten sequential single-call turns cost ten full context reads; the same ten calls issued in one turn cost one. With a large resident instruction set, a routine ten-step fix round can cost over a million tokens purely in re-reads.

## 1. Batch independent calls into one turn

**If two calls do not consume each other's output, they belong in the same turn.** This is the highest-leverage rule in this file.

Concrete places it applies in this repo:

| Instead of                                                                               | Do                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `github_view_pr` → `github_get_review_threads` → `github_pr_batch_status` in three turns | All three in one turn                              |
| `github_auth_status` then `jira_auth_status`                                             | `auth_check_all` (one call, all four services)     |
| Reading changed files one at a time during self-review                                   | All `Read` calls in one turn                       |
| A `Grep` probe, then a `Glob` probe, then another `Grep`                                 | Issue the whole reconnaissance set at once         |
| Loading MCP tool schemas one at a time                                                   | One `ToolSearch("select:a,b,c")` with a comma list |

The exception is a genuine dependency: you cannot read a run's logs before you have its run ID.

## 2. Read narrowly

- **Size before you read.** `worktree_file_info({ paths: [...] })` returns bytes, lines, and approximate token counts in one round-trip. Anything large gets `Read(offset, limit)`, not a blind full read.
- **Narrow before you widen.** `Grep(output_mode: "files_with_matches")` first; `content` mode only on the narrowed set; `head_limit` on anything that could be broad.
- A file you have already read this session is in context — re-reading it to "check" costs a full copy and tells you nothing new.

## 3. Offload bulk reading to subagents

Per AGENTS.md behavior 4, heavy research goes to an in-context `Agent` subagent that returns a summary. The highest-value application is the **self-review gate**: reading every changed file in full against the 20 common review patterns pours entire file contents into the main context. A subagent returning findings costs a fraction of that. Prompt it cold — subagents do not inherit `AGENTS.md` (see [subagent-templates](../../subagent-templates/SKILL.md)).

## 4. Use the batch tools that already exist

Prefer one batched call over N single calls:

| Batch tool                                                                                                               | Replaces                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `github_pr_batch_status({ prs: [...] })`                                                                                 | N × `github_view_pr`            |
| `ci_view_run_batch`, `ci_rerun_batch`                                                                                    | N × `ci_view_run` / `ci_rerun`  |
| `worktree_status_batch`, `worktree_commit_batch`, `worktree_push_batch`                                                  | N × the single-worktree variant |
| `github_bulk_comment`, `github_bulk_edit`, `github_bulk_merge`, `github_bulk_rebase`, `github_bulk_reply_to_review`      | N × the single-PR variant       |
| `jira_bulk_create_tickets`, `jira_bulk_edit`, `jira_bulk_transition`, `jira_bulk_link_issues`, `jira_bulk_list_children` | N × the single-issue variant    |
| `aws_logs_tail({ functions: [...] })`                                                                                    | N × single-function tails       |

Many of these also accept `compact: true` — use it when you only need the decision-relevant fields.

## 5. Wait in-turn where you can

A wait that resolves inside the current turn costs one context; a wake costs a fresh one. Prefer `ci_wait_run`, `ci_dispatch_workflow({ waitForCompletion: true })`, `make_run_wait`, `nx_job_wait`, `worktree_job_wait`. And `Bash(run_in_background: true)` already re-invokes you on exit — never also schedule a check-in for it. Full routing: [waiting-and-wakeups](waiting-and-wakeups.md).

## 6. Say less

Tool results are already in context; restating them costs tokens twice. No per-step narration ("Now running validation", "All 487 tests pass. Committing."), no summary of what the last tool call plainly showed. One line per meaningful outcome. On a wake that needs no action, say nothing at all — see [waiting-and-wakeups Invariant 3](waiting-and-wakeups.md#invariants).

## Provenance and maintenance

Created 2026-09-03 (branch `claude/reduce-agent-pr-noise-44c47a`). Motivated by an audit of a live PR-drive transcript: roughly ten sequential single-call turns for a two-comment review round, plus six full test-suite runs, against an instruction set of ~125k resident tokens. No guidance on batching tool calls into a turn existed anywhere in `AGENTS.md`, `mcp-first`, `pr-lifecycle`, or `dev-process` at the time.

Re-verify volatile facts:

- Batch-tool list above: `ToolSearch("batch")` / `ToolSearch("bulk")` against the live registry
- `worktree_file_info` token-count fields: [mcp-first § File Size & Line Count](../SKILL.md#file-size--line-count)
