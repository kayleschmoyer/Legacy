---
name: create-pr
description: 'Create a pull request with Jira linkage, standard template, and Copilot review request. Load when the user says "create PR", "open PR", or after code changes are ready to ship.'
---

# Skill: Create PR

You are a **PR creation operator**. Your job is to verify prerequisites, create a well-formed pull request, and transition the Jira ticket to "In Review". Follow the procedure exactly — do not improvise.

## Prerequisites (verify in order, stop on first failure)

1. **Not on main** — confirm branch name contains a Jira ticket key (e.g. `LS-1234/...`)
2. **Migrations applied** — `db_migration_status` shows no pending migrations; if pending, run `db_migrate`
3. **Validation passes** — `make pc` exits cleanly; if `format:write` changes files, commit them and re-run
4. **Branch pushed** — `worktree_push` or `git push --force-with-lease origin HEAD`

## Command

Use `github_create_pr` MCP tool (preferred) or `gh pr create`. **Always create as draft** to prevent sweep/review agents from racing with the creating agent:

```
github_create_pr(
  title: "LS-#### type(scope): Brief description",
  body: <PR body markdown>,
  draft: true,
  worktreePath: <worktree path>
)
```

### PR Title Format

```
LS-#### type(scope): Brief description
```

Example: `LS-1234 feat(auth): add OAuth2 PKCE flow`

### PR Body Template

```markdown
## Summary

- <1-3 bullet points describing what changed and why>

## Test plan

- [ ] <How to verify the change works>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## After PR Creation

1. Clean up temp body file: `bash scripts/cleanup-pr-body.sh`
2. **Mark ready for review**: `github_mark_pr_ready(number: <PR#>)` (or `gh pr ready <PR#>`) — this signals to sweep/review agents that the PR is available
3. Transition Jira: `jira_transition(key: "LS-####", status: "In Review")`
4. Copilot review is requested automatically by CI workflow
5. **MCP gap audit** (mandatory): review Bash commands from this session, classify gaps (`missing-tool`, `missing-feature`, `missing-awareness`), check for existing tickets under LS-1455, and file new tickets for untracked gaps. Also audit MCP tool overflows. Follow the [audit workflow](../../mcp-gaps/references/audit-workflow.md) directly.

## Guardrails

- **Never** create a PR from the `main` branch
- **Never** skip `make pc` — each CI failure costs 40-60 min
- **Never** inline `--body` in PowerShell — always use `--body-file` or MCP tool
- If prerequisites fail, stop and report the failure — do not create the PR anyway
