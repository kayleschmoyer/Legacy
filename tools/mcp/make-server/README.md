# legacy-sports-make MCP Server

Exposes Makefile targets as structured MCP tools for AI agents. Prevents agents from running raw `make` commands via Bash by providing a whitelisted, validated interface.

## Tools

| Tool                   | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `make_run`             | Run a whitelisted make target (pc, install, build, test, lint, etc.)     |
| `make_wt_setup`        | Set up a worktree (junction, .env, hooks) with optional junction removal |
| `make_worktree_create` | Create a new worktree for a Jira ticket                                  |

## `make_run` Allowed Targets

**Validation:** pc, pre-commit, quick-check, validate
**Build:** build, build-all, build-web, build-mobile, build-lambdas, build-libs
**Test:** test, test-all, test-e2e
**Lint/Format:** lint, lint-fix, lint-workflows, lint-skills, format, fmt, format-commit
**Types:** typecheck
**Codegen:** codegen
**Install:** install, install-force, install-node, install-python, setup, setup-force, setup-hooks
**Database:** db-migrate, db-check-connections
**Clean:** clean-safe, clean-cache, reset
**Troubleshooting:** kill-stale, diagnose
**Composite:** full-check, dev-setup

## Usage

```
# Run pre-commit validation in a worktree
make_run(target: "pc", cwd: "D:\\code\\legacy-sports-worktrees\\LS-1234-fix")

# Create a worktree
make_worktree_create(ticket: "1234", description: "fix-scoring")

# Set up worktree with independent node_modules
make_wt_setup(worktreePath: "D:\\code\\legacy-sports-worktrees\\LS-1234-fix", removeJunction: true)
```
