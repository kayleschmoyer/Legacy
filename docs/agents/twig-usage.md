# AI Agent Guide: Twig Rebase & Cascade

This guide distills the workflows an autonomous agent should follow when using Twig to manage stacked feature work. It focuses on keeping a branch tree healthy with `twig rebase` (upward) and `twig cascade` (downward), then applies those workflows to a realistic multi-branch feature implementation.

## Audience & Goals
- Ensure AI agents can operate Twig safely in CI-like, non-interactive contexts.
- Standardize how rebases and cascades are automated so stacks stay linear and conflict free.
- Provide an end-to-end playbook for shipping a complex feature by layering incremental branches.

## Operational Checklist
1. **Confirm workspace**: `git status -sb` should show the intended feature branch; stash or commit local edits before automation.
2. **Inspect branch graph**: `twig tree --include-remote` plus `twig branch root list` to understand roots and dependencies (see `BRANCH_TREE_STRUCTURE.md`).
3. **Sync metadata**: run `twig sync` so Jira/PR links and branch parents are up to date.
4. **Pick the right repo**: pass `--repo <path>` to Twig commands when acting from an orchestration directory.
5. **Ensure single parents when needed**: use `twig branch depend <child> <parent> --exclusive` to drop every other parent before wiring a new dependency (useful when hard-resetting stacks).
6. **Enable tracing**: add `-v`/`-vv` to Twig invocations to keep logs that humans can audit later.

## Rebase vs Cascade
Both commands rely on Twig's explicit dependency graph (stored in `.twig/state.json`). They complement each other:

| Command | Direction | Use When | Key Flags | Automation Notes |
| --- | --- | --- | --- | --- |
| `twig rebase` | Upstream (current branch onto parents) | Pulling down new review feedback or `main` updates before developing further | `--show-graph`, `--autostash`, `--skip-commits`, `--no-interactive`, `--force` | Detect existing rebases via `git rebase --show-current` and bail fast; favor `--no-interactive` for headless runs so failures are explicit. |
| `twig cascade` | Downstream (current branch -> children) | Propagating freshly rebased commits to every dependent branch once the base is clean | `--max-depth`, `--force`, `--force-push`, `--show-graph`, `--skip-commits`, `--autostash`, `--no-interactive` | Run from the highest branch in the stack that just changed; log the branch order emitted by Twig to correlate with PR IDs; combine with `twig tree` output for status reports. |

### Conflict Handling Pattern
- Always run with `--no-interactive` in unattended sessions. Twig will exit on the first conflict, letting you surface a deterministic remediation task.
- When human-in-the-loop conflict fixing is acceptable, omit `--no-interactive` so Twig will prompt with resume/abort guidance (see `twig-cli/src/cli/cascade.rs` and `twig-cli/src/cli/rebase.rs`).
- Use `--skip-commits=<hashes|file>` to prevent known bad commits from replaying while keeping the rest of the stack moving.
- Pair `--autostash` with pre-flight `git status --porcelain` to avoid losing local edits.

### Force Push Policy During Cascades
- `--force-push` is designed for intentional overwrites of remote stack branches. Require an upstream check (e.g., verify GitHub branch protection or use dry runs) before enabling it.
- Combine with `--force` only when you must rebuild history even if a branch appears up to date (useful after rewriting commits via `git commit --amend`).

## Complex Feature Playbook
The `BRANCH_TREE_STRUCTURE.md` file describes an idealized tree where foundational work flows into CLI, tidy, and cascade enhancements. The following playbook shows how an agent can drive that structure end-to-end.

### 1. Map the Work
```bash
twig tree
twig branch depend feature/enhanced-cli-commands feature/foundation-improvements
twig branch depend feature/tidy-command feature/enhanced-cli-commands --exclusive
```
- Confirm each child branch depends on the layer beneath it.
- Mark long-lived bases as roots (`twig branch root add main`).

### 2. Build Foundations First
1. Checkout the lowest branch (e.g., `feature/foundation-improvements`).
2. Keep it rebased on `main` using `twig rebase --show-graph --no-interactive`.
3. Run `make check` or `cargo nextest run` via `make test` before cascading.

### 3. Layer Higher Branches Safely
For each subsequent branch (`feature/enhanced-cli-commands`, `feature/tidy-command`, etc.):
```bash
twig switch feature/enhanced-cli-commands
twig rebase --autostash --no-interactive
# implement commits, run tests
```
- Store Jira/PR metadata with `twig sync` so later status dashboards are accurate.
- Use `twig tree --show-orphaned` to detect branches missing parents before cascading.

### 4. Propagate With Cascades
Once the topmost branch in a stack is updated:
```bash
twig switch feature/foundation-improvements
twig cascade --show-graph --max-depth 3 --autostash --no-interactive
```
- Twig walks descendants breadth-first, only queuing a branch when all parents rebased cleanly.
- Capture the order Twig prints; map it to PR URLs so reviewers know what moved.
- If a branch is missing locally, Twig logs a warning and continues, which agents should echo back to humans for follow-up.

### 5. Handle Conflicts Explicitly
- If `twig cascade` exits with a conflict while `--no-interactive` is set, leave the repo in conflict state. Surface a task describing the file set (`git status --short`).
- After a human resolves it, run `git rebase --continue` and re-run `twig cascade` to finish remaining branches.

### 6. Force Push & Verification
When rebases rewrite public history:
```bash
twig cascade --force --force-push --no-interactive
```
- Ensure corresponding PRs allow force pushes.
- After cascading, run `twig github pr status` or `twig dashboard --include-remote` to verify alignment.

## Automation Tips for Agents
- **Dry Runs**: There is no dedicated `--dry-run`, so emulate it by running `twig tree` plus `git log --oneline parent..child` to summarize pending work before acting.
- **Partial Cascades**: Use `--max-depth` to limit how far downward the cascade travels when only near-term descendants need updates (e.g., hotfix scenarios).
- **Resume Strategy**: Twig tracks active rebases with Git; before restarting any automation, check `git rebase --show-current` and call `git rebase --abort` if necessary.
- **Repointing branches**: Prefer `twig branch depend <child> <parent> --exclusive` when migrating a branch to a new single parent; this guarantees no stale parents linger in `.twig/state.json` before you cascade.
- **Logging**: Pipe Twig output to structured logs so branch orders and warnings can be parsed later.
- **Validation**: After every cascade, run `twig tree` and compare against expected topology; mismatch implies missing dependencies or deleted branches.

## Deliverable Recap for Complex Features
1. `foundation` branch up to date with `main` (verified via `twig rebase`).
2. CLI/Tidy/Cascade enhancement branches rebased in order and cascaded downstream after each upstream change.
3. PR dashboard showing each branch ready for review with synced Jira tickets.
4. Audit log including command invocations, options, and `git status` snapshots for recovery.

Following this guide keeps stacked feature development predictable for both humans and AI agents, while leveraging Twig's explicit dependency graph to avoid conflict storms.
