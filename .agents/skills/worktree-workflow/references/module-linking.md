# Module Linking and Worktree Environment Setup

> Loaded from [worktree-workflow SKILL](../SKILL.md), native-flow step 7. How `node_modules` and the gitignored secret env files are linked into a worktree, how to install packages or regenerate the lockfile without destroying the shared pool slot, and how to recover a broken link.

## Linking the pool slot

```
node scripts/modules-pool/link.mjs
```

Run from the worktree root. It hashes the worktree's `pnpm-lock.yaml` and links `node_modules` to the matching content-addressable pool slot (`<main>/.modules-pool/<hash>/node_modules`), materialising the slot on a miss (`pnpm install --frozen-lockfile` → atomic publish) and re-linking in milliseconds on a hit. Uses Node.js `fs`/`cmd` internally — no shell escaping needed. Idempotent. Creates a directory symlink (`mklink /D`) when Windows Developer Mode allows it, and otherwise falls back to a directory junction (`mklink /J`) on its own (LS-11021) — exits non-zero if neither link can be created. **Precondition for any manual symlink creation in a worktree: the resolver has failed.** Manual `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, and `mklink /J` bypass `.modules.yaml` path consistency checks and cause Nx graph failures, so they are not a supported fallback.

In addition to `node_modules`, the resolver also links the main repo's gitignored secret files (`.env`, `.env.local`) into the worktree as file symlinks. This is what lets agents run integration tests locally — `playwright.integration.config.ts` loads `<repo>/.env` for `E2E_COMMISSIONER_*`, `E2E_MANAGER_*`, `VITE_OAUTH_PROXY_URL`, etc. — without manual per-worktree credential copying. Symlinks (not copies) ensure secret rotations in main propagate automatically. If a real file is already present in the worktree (not a symlink), the resolver leaves it alone — delete it manually if you want to switch to the linked copy.

### Prerequisite: Windows Developer Mode

`node_modules` is a directory symlink (`mklink /D`), which an unelevated Windows user can only create with **Developer Mode** on (Settings > System > For Developers > Developer Mode). Check quickly from Git Bash: `cmd //c mklink //D "%TEMP%\\probe-link" "%TEMP%"`. If that prints "You do not have sufficient privilege", Developer Mode is off. Turning it on is a system setting the **user** must change. Agents must not change it or fall back to junctions.

**Failure signature (LS-10597):**

```
[modules-pool/link][ERROR] Failed to create directory symlink: Command failed: cmd /c mklink /D <wt>\node_modules <main>\.modules-pool\<hash>\node_modules
You do not have sufficient privilege to perform this operation.

Directory symlinks require Windows Developer Mode.
```

`link.mjs` exits **1** and leaves no `node_modules` in the worktree, not even an empty directory. The SessionStart hook (`.claude/hooks/setup-worktree-symlink.sh`/`.ps1`) stays non-blocking. It now prints a `[SETUP ERROR] scripts/modules-pool/link.mjs failed (exit 1) — node_modules is NOT linked` banner, and the full output goes to `$TMPDIR/claude-setup-worktree-symlink.log`. If you skip past it, the same root cause shows up later as `'nx' is not recognized` from the pre-push hook or as stdio MCP servers timing out. Callers that chain on `link.mjs` must check its exit code, not whether `node_modules` exists.

> **Verify after setup**: confirm the linked slot is populated:
>
> ```
> test -d node_modules/nx && echo ok || echo EMPTY
> ```
>
> If `EMPTY`, the slot did not materialise — re-run `node scripts/modules-pool/link.mjs` and read its output for a `pnpm install` error or a Developer-Mode symlink failure.

> **Installing new packages in a worktree** — a worktree's `node_modules` is a symlink into an **immutable** shared pool slot, so never `pnpm add`/`pnpm install` straight through it. Adding a package changes the lockfile → a new slot:
>
> 1. `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` — removes the symlink only, not the pool slot
> 2. `pnpm add -w <package>` — adds the package to root `package.json` (rewrites the lockfile)
> 3. `make install` (or `node scripts/modules-pool/link.mjs`) — materialises and links the new slot
>
> See [install-packages.md](../../repo-tooling/references/install-packages.md) for the full procedure.

> **Broken or missing `node_modules` recovery**: use `worktree_install_recover()` (MCP-first) — it handles symlink repair and slot materialisation without a shell fallback. Shell fallback (only if the worktree MCP server is unavailable): re-run `node scripts/modules-pool/link.mjs` from the worktree root. If a healthy slot exists it re-links instantly; otherwise it materialises a fresh one. **Precondition for manual symlink recreation: the resolver has failed.** `mklink /J`, `mklink /D`, `New-Item -ItemType Junction`, and `New-Item -ItemType SymbolicLink` bypass `.modules.yaml` path consistency checks and cause Nx graph failures, so they are not a supported fallback.
>
> **`pnpm-lock.yaml` out of sync with `package.json` (e.g. after a rebase)**: never run `pnpm install --no-frozen-lockfile` or `pnpm install --lockfile-only` directly in a worktree — through the symlinked `node_modules` it prompts to remove and reinstall the whole tree, destroying the shared pool slot every other worktree on that lockfile hash still points to. See the safe manual importer-entry edit + `link.mjs`/`worktree_install_recover()` re-materialize pattern in [rebase-conflict-strategies.md § pnpm-lock.yaml](rebase/rebase-conflict-strategies.md#pnpm-lockyaml) (LS-4889).
>
> **Regenerating `pnpm-lock.yaml` after editing a `package.json` (LS-9837)**: use `make lockfile`. It copies just the manifests/workspace config/patches pnpm needs to resolve into an isolated temp directory (no `node_modules` at all there), runs `pnpm install --lockfile-only --ignore-scripts` in that temp dir, then copies the resulting `pnpm-lock.yaml` back into the worktree — never touching the worktree's symlinked `node_modules` or the shared pool. Takes ~10-60s depending on how much of the dependency graph changed. This is the sanctioned replacement for the two paths that don't actually work from inside a worktree: `make install` (link-only on Windows — doesn't regenerate anything) and `pnpm install --frozen-lockfile` (refuses to change the lockfile by design). After running it, re-link `node_modules` to the new lockfile hash with `node scripts/modules-pool/link.mjs` (or `make install`) before validating. See `scripts/lockfile-regen.sh` for the implementation; `guard-risky-tools.mjs`'s `pnpmInstallGate()` is scoped to the command's actual cwd so the isolated temp-dir install never false-positive-blocks while a real install through the worktree symlink still does.
>
> See also [workflow-recovery-procedures.md](shared/workflow-recovery-procedures.md).

## Native-flow specifics

- **`make_wt_setup` is NOT used** — it's sibling-only. The symlink command above replaces it.
- **`worktree_list` / `make_worktree_create` are NOT used** — you're already in a worktree, Claude Code created it for you.
- **On exit**, `ExitWorktree(action: "remove")` cleans up the ephemeral worktree. Only call this when explicitly done — the worktree can survive across sessions if kept.
- **All stdio MCP servers in `.mcp.json`** should connect in every session (`MCP_TIMEOUT=10000` in `.claude/settings.json` ensures startup headroom). If a server is unexpectedly missing or timing out, **first verify the `node_modules` symlink exists** — stdio servers launch via `node .github/copilot/hooks/mcp-bootstrap.mjs node --import tsx <server>` (see `.mcp.json`) and time out silently if `node_modules/.bin/tsx` is missing. Run `node scripts/modules-pool/link.mjs` (from the worktree root) to link `node_modules` to the worktree's content-addressable pool slot, then restart the session. Without Windows Developer Mode the resolver links via a junction automatically. **Never** use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or raw `mklink /J` — they bypass path consistency checks. The `SessionStart` hook attempts this automatically but may not fire in all session types (e.g., Copilot CLI).

## Push and validation failures caused by a broken link

**Pre-push hook fails with `nx` not found or `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty or missing (where the pnpm shims live). Use `worktree_push({ skipLint: true })` — do **not** use `SKIP_PREPUSH_LINT=1 git push`. **Important:** `skipLint` bypasses the entire hook after the lockfile checks — conflict-marker and Terraform validations are also skipped, not just formatting. Only use as a last resort; manually run Prettier and check for conflict markers before pushing: `node node_modules/prettier/bin/prettier.cjs --write <files>`. Do not attempt `make install` from the worktree while symlinks exist — ask the user to repair the main repo instead.

- **`make pc` fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "nx" not found`**: the `node_modules` symlink is broken. Repair with `worktree_install_recover()` (MCP-first, **not** `node scripts/modules-pool/link.mjs` via Bash), then restart the session before retrying. **Known cause**: running `pnpm exec nx reset` directly destroys the pooled symlink (LS-5242). To clear the Nx cache safely use `make_run(target: "clean-cache")`, which re-links the symlink automatically.
