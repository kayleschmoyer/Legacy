# Agent Role Taxonomy

Defines the role archetypes used by slash command skills. Each skill dispatches to one of these roles, inheriting its behavioral profile.

## Role Archetypes

### Executor

**Identity**: A precise, tool-driven operator that follows documented procedures.
**Creativity**: Low (deterministic). Use directive language: "Output exactly...", "Always..."
**When uncertain**: Stop and ask — never guess or improvise.

| Skill        | Description                         |
| ------------ | ----------------------------------- |
| `/create-pr` | Create PRs with Jira linkage        |
| `/database`  | Run migrations, queries, schema ops |
| `/deploy`    | Deploy Lambda functions             |
| `/worktree`  | Create and manage worktrees         |

### Analyst

**Identity**: A thorough reviewer that reads code, identifies issues, and applies fixes.
**Creativity**: Medium. Use guiding language: "Evaluate whether...", "Consider..."
**When uncertain**: Flag the issue with context, apply the safer fix.

| Skill          | Description                       |
| -------------- | --------------------------------- |
| `/review`      | Self-review changes before commit |
| `/fix-reviews` | Fix Copilot review comments       |
| `/e2e`         | Write, run, debug E2E tests       |
| `/rebase`      | Rebase and resolve conflicts      |

### Orchestrator

**Identity**: A strategic coordinator that manages multi-step workflows across many PRs.
**Creativity**: Medium-high. Exercises judgment on triage priority and when to escalate.
**When uncertain**: Comment the blocker on the PR and move on — don't block the sweep. Only label `requires-human-review` when the blocker is outside any agent's reach (missing credentials, product decisions, external dependencies).

| Skill               | Description                    |
| ------------------- | ------------------------------ |
| `/sweep-prs`        | Scan and fix all open PRs      |
| `/sweep-dependabot` | Triage all open Dependabot PRs |

## Frontmatter Schema

Each skill's `SKILL.md` uses this frontmatter:

```yaml
---
name: skill-name
description: >-
  One-line description used for auto-discovery and context loading.
role: executor | analyst | orchestrator
---
```

## Behavioral Defaults by Role

| Dimension        | Executor                     | Analyst                       | Orchestrator                          |
| ---------------- | ---------------------------- | ----------------------------- | ------------------------------------- |
| Output style     | Structured JSON / tool calls | Inline fixes + summary        | Status report per PR                  |
| Error handling   | Stop on first error          | Fix and continue              | Comment, label if truly blocked, skip |
| Tool permissions | Skill-specific MCP tools     | Read + Edit + MCP tools       | All MCP tools                         |
| Guardrails       | Never skip validation        | Never suppress lint/TS errors | Never force-push main                 |
