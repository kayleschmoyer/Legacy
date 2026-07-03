# Environment Troubleshooting

Quick-reference fixes for common dev-environment issues. Commands are shown for bash (the Bash tool, CI, cloud agents); PowerShell variants are noted only where they differ. Full port map and service startup live in [dev-environment](../../dev-environment/SKILL.md); Make/Nx tooling detail lives in [repo-tooling](../../repo-tooling/SKILL.md).

## Common Fixes by Symptom

### Module Not Found

```bash
pnpm run build:libs
```

### DB Connection Fails / Credentials Stale

```bash
pnpm run sync-env      # PowerShell-backed on Windows; see dev-environment for the cloud story
pnpm run db:test       # verify the connection afterwards
pnpm run db:credentials  # inspect what credentials are in use
```

### Port Already in Use

The web dev server runs on **4200** (`apps/web/vite.config.mts`); see [dev-environment](../../dev-environment/SKILL.md) for the full port map (lambdas 5000-5003, Postgres 5432, Storybook 6009).

```bash
pnpm dlx kill-port 4200
```

### Nx Cache Issues (Unexpected Build Results)

Before clearing the cache, use `make clean-cache` — in a pooled-symlink worktree it re-links `node_modules` afterwards. Running `pnpm exec nx reset` directly destroys the pool symlink (LS-5242, AGENTS.md Tier 2) and takes every stdio MCP server down with it.

```bash
make clean-cache       # alias: make reset
```

### AWS CLI Encoding Errors (Unicode/emoji, Windows)

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:AWS_PAGER = ""
```

### `acli` or `twig` Not Found (Windows)

```powershell
# Refresh PATH in the current session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### EPERM / Native Addon File Lock (`bufferutil.node`, Windows)

Symptom: `ERR_PNPM_EPERM ... unlink ... node_modules\bufferutil\...\bufferutil.node` during `make install` or `make clean`.

A background node process (usually the VS Code Playwright extension's `test-server` or a manually started dev server) is holding a native `.node` addon open.

```bash
make kill-stale DRYRUN=1   # preview which processes hold locks
make kill-stale            # kill them
make clean install         # then retry
```

If `make kill-stale` reports no processes but the error persists, a non-node process may hold the lock — use Process Explorer or Sysinternals `handle.exe`.

### Stdio MCP Servers Missing or Timing Out

Verify `node_modules/.bin/tsx` exists — servers start with `pnpm exec tsx ...` and time out silently when the install is broken. Recover with `node scripts/modules-pool/link.mjs`, then restart the servers (see AGENTS.md "MCP Servers").

### Terraform State Locked

```bash
node scripts/terraform-unlock.js          # check for locks
node scripts/terraform-unlock.js --latest # release the most recent lock
```

For the incident history and CI auto-clearing behavior, see the [terraform skill](../../terraform/SKILL.md).

### Complete Reset (Nuclear Option)

Precondition: never delete `node_modules` or run `pnpm install` directly in a pooled-symlink worktree — `node_modules` there is a symlink into the shared pool (see `docs/rfcs/modules-pool/`). Use the Make targets, which route through the pool correctly:

```bash
make clean install
pnpm run build:libs
```

---

## By Error Type

### TypeScript Errors

1. `pnpm run build:libs` — resolves most "module not found" type errors
2. Stale generated types: `pnpm exec nx run <project>:codegen` (or `make codegen` after schema changes)
3. Other errors: see [repo-tooling](../../repo-tooling/SKILL.md)

### Linting Errors

1. `pnpm exec nx affected -t lint --fix` — auto-fixes most
2. Remaining errors: see [fix-lint](../../repo-tooling/references/fix-lint.md)

### Test Failures

1. Read the failure message carefully
2. Snapshot mismatch: `pnpm exec nx test <project> --updateSnapshot`
3. DB connection issue: `pnpm run sync-env`
4. If implementation changed intentionally, update the test — see [testing](../../testing/SKILL.md)

### Build Failures

1. Dependencies installed the pool-safe way: `make install`
2. Build libs first: `pnpm run build:libs`
3. Circular dependencies: `pnpm exec nx graph`

### CI Failures

Reproduce locally with the chunked validation pipeline (see AGENTS.md "Validate with seven pc-\* chunks" and [workflow-overview](../../workflow-overview/SKILL.md) for the environment binding), then debug remote-only failures from logs:

```
ci_list_runs(branch: "BRANCH_NAME", limit: 5)
ci_get_logs(runId: RUN_ID, failedOnly: true)
ci_rerun_failed_jobs(runId: RUN_ID)   # only for flaky/transient failures
```

Full playbook: [ci-failure.md](ci-failure.md).

### Production Client Errors (Rollbar)

Moved to [prod-errors.md](prod-errors.md) — Rollbar MCP tools, the error-classification convention, and the client-side noise/rate-limit checklist.

### Git / Branch Issues

```bash
git status
git branch
twig tree            # view branch tree (local Windows sessions; twig is not installed on cloud agents)
make rebase-tree     # rebase dependent branches
```

---

## Quick Issue → Fix Lookup

| Problem                | Fix                                                            |
| ---------------------- | -------------------------------------------------------------- |
| `acli not found`       | Refresh PATH (see above)                                       |
| Module not found       | `pnpm run build:libs`                                          |
| Type errors            | [repo-tooling](../../repo-tooling/SKILL.md)                    |
| DB connection fails    | `pnpm run sync-env`                                            |
| Port in use            | `pnpm dlx kill-port 4200`                                      |
| Nx cache issues        | `make clean-cache`                                             |
| Stdio MCP servers dead | `node scripts/modules-pool/link.mjs`                           |
| AWS CLI encoding error | `$env:PYTHONIOENCODING = "utf-8"`                              |
| Terraform state locked | `node scripts/terraform-unlock.js`                             |
| Rollbar noise / 429    | [prod-errors.md](prod-errors.md#client-side-web-rollbar-noise) |

## Nx Cache Reset (Detailed)

Escalate one level at a time — the Nx cache makes builds much faster, so only reset when actually needed.

### Level 1: Cache Only (Fastest)

```bash
make clean-cache     # clears .nx cache, stops daemon, re-links pooled node_modules
```

### Level 2: Full Clean (Slower)

```bash
make clean install
pnpm run build:libs
```

### Level 3: Daemon Won't Stop

```bash
pnpm exec nx daemon --stop
make clean-cache
```

(Note: the Nx daemon is disabled on Windows — `NX_DAEMON=false` — so this level applies to Linux/cloud only.)

## Provenance and maintenance

Rewritten 2026-07-02 by the skills audit (debugging-playbook refresh): removed banned `pnpm exec nx reset` advice (3x), nonexistent `make clean:all`, stale ports 3000/4000, dead `sync-env`/`aws-sso-login` skill links, and the raw `Remove-Item node_modules; pnpm install` reset that breaks the modules pool. Re-verify volatile facts:

- Make targets: `grep -n "^clean-cache:\|^kill-stale:\|^install:\|^rebase-tree:" Makefile`
- Root scripts: `node -e "console.log(Object.keys(require('./package.json').scripts))"`
- Web port: `grep -n "port" apps/web/vite.config.mts`
- Unlock script: `ls scripts/terraform-unlock.js`
