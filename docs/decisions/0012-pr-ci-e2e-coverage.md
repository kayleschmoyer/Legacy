# 0012. Affected-selection e2e coverage on PR CI to close the nightly regression gap

Date: 2026-06-08

## Status

Proposed

## Context

PR CI runs only a grep-filtered subset of the hermetic Playwright e2e suite —
`@critical` minus `@slow` (~288 tests, 1 shard / 4 workers, ~5.3 min). The full
un-filtered suite (~1,390 tests, 3 shards, ~10 min wall / ~30 runner-min,
including `@slow`) runs only on the 03:00 UTC nightly and on demand. Measured
coverage: **PR CI exercises ~21% of e2e specs; ~79% are nightly-only.**
Integration e2e runs on **0%** of PRs (opt-in via the `run:integration` label).

Two consequences fall out of this:

1. **e2e regressions and stale-after-UI-change tests merge cleanly** and only
   surface at the nightly — a steady stream of leaked failing clusters (admin
   hub, "Get Started Free" CTA, trades, notifications, twenty-questions,
   player-comparison, subscription, …). One recent session filed/fixed ~15 such
   clusters that all passed PR CI before merge.
2. The e2e job is **not a required status check** (`.github/ruleset.json`
   requires only `bot-review`, `No Merge Conflicts`, `Verify All Migrations
Applied`, and `🚀 CI Pipeline / {lint,format,build,test,custom-checks}`). So
   even the `@critical` subset that _does_ run on PRs does not block merge.

The repo already has a **proven affected-spec selection system** for the
live-backend integration suite:

- `apps/web-e2e/src/integration/integration-surface-map.json` — a maintained
  manifest mapping each spec → the source globs it exercises, plus
  `runAllWhenChanged` for broad surfaces.
- `.github/scripts/integration-select/select-specs.mjs` — a manifest-agnostic
  selector that diffs changed files → selected specs (union of: edited spec,
  surface-glob match, and `runAllWhenChanged`).
- A unit test enforces every integration spec has a map entry (presence-lint).

Forces in tension:

- **Coverage vs. CI cost.** Running the full hermetic suite on every web PR is
  ~6× the runner-minutes of `@critical`. Affected-selection keeps the common
  case cheap.
- **Coverage vs. flake exposure.** Making any e2e check _blocking_ exposes the
  shared merge gate to e2e flake. The suite targets zero flake (LS-4421,
  `retries: 0`) but is not yet proven flake-clean; integration determinism is
  tracked separately (LS-7845, not yet landed).
- **Precision vs. maintenance.** A hand-maintained 103-spec map can
  under-select (a missed regression — the exact failure we are fixing). The
  integration map's guidance applies: _over-selection is safe; under-selection
  is the risk we design against, so globs lean broad._

This map is also a **prerequisite for the LS-7848 drift auditor (LS-7850)**,
which audits the map against per-test coverage data — so the manifest must exist
regardless of the gating decision.

### Alternatives considered

1. **Widen the `@critical` grep** to more tags. Rejected: tag curation is manual
   and orthogonal to _what the PR changed_; it does not target the affected area.
2. **Full hermetic suite as a required check** on PRs touching `apps/web`,
   `lib/shared-components`, or `apps/web-e2e` (the "stronger alternative").
   Rejected as the default: ~6× CI minutes on every web PR and maximal flake
   exposure on the shared merge gate, with no surface map to feed LS-7850. Its
   strength — full coverage on broad changes — is preserved here via
   `runAllWhenChanged` (see Decision).
3. **Gate merge-queue entry on a recent full-suite pass.** Rejected: decouples
   the signal from the PR diff and adds queue latency; does not catch the
   regression at authoring time.
4. **Advisory-only** (run affected specs but keep e2e non-required). Rejected:
   a non-blocking signal is what `@critical` already effectively is — it does
   not _stop_ the leak.

## Decision

We will **extend the integration surface-map pattern to the hermetic e2e suite
and make affected-selection a blocking PR check**, reusing the existing
selection engine unchanged.

Concretely:

1. **Surface map** — `apps/web-e2e/src/e2e-surface-map.json` maps all 103
   hermetic specs (`apps/web-e2e/src/tests/*.spec.ts`) to source-surface globs,
   with `runAllWhenChanged` covering broad surfaces that can break many flows:
   GraphQL schema, `lib/shared-components/src/**`, the web app shell / global
   context / data layer, global layout & a11y components, and the shared e2e
   harness/config. Globs lean broad.
2. **Selector** — the existing `select-specs.mjs` is manifest-agnostic and is
   reused as-is with `--manifest apps/web-e2e/src/e2e-surface-map.json`. No fork.
3. **PR-CI execution (additive to `@critical`)** — `ci-pipeline.yml`'s
   `detect-changes` job computes the affected spec set from the PR diff. The
   `e2e` job then runs:
   - **narrow change** → `@critical` (the always-on safety net, minus `@slow`)
     on 1 shard, **plus** the affected specs (minus `@critical`/`@slow`) in a
     second step;
   - **broad change** (`runAllWhenChanged` hit) → the **full** suite (minus
     `@slow`), dynamically sharded to 3 shards to stay within the per-job
     timeout. This recovers the "stronger alternative's" full coverage exactly
     where it matters most.
4. **Blocking gate** — a stable-named aggregation job `e2e-affected` (one fixed
   check context regardless of shard count) is added to `.github/ruleset.json`
   as a required status check. It passes when e2e succeeded or was legitimately
   skipped (non-web PR) and fails when any e2e shard failed.
5. **Presence-lint** — a unit test (run inside the required `custom-checks` job)
   fails CI if any spec on disk lacks a map entry, forcing every **new** spec to
   be mapped at PR time. This keeps the map honest and keeps LS-7850's input
   complete.

`@critical` is retained as an always-on safety net so a change in an area the
map under-selects is still covered by the critical-path suite.

**Integration stays out of the PR gate** until determinism lands (LS-7845).

### Rollout

Live enforcement of a required status check requires admin privileges
(`scripts/apply-ruleset.sh` with `RULESET_ADMIN_TOKEN`), which CI agents do not
hold. This change therefore lands the **mechanism and the config**: the
`e2e-affected` job runs on every PR immediately, and the ruleset entry is added
in `.github/ruleset.json`. A **maintainer runs `bash scripts/apply-ruleset.sh`**
to promote it to live enforcement. Until then, `check-ruleset.yml` (a
non-required drift check) reports expected drift, and PRs remain gated by the
eight previously-live required checks.

## Consequences

### Easier

- Regressions in a PR's affected area (admin hub, trades, notifications, etc.)
  are caught **on the PR** instead of at the nightly — the leak this ticket was
  filed to close.
- Broad changes (shared-components, app shell, e2e harness) get **full-suite**
  coverage automatically via `runAllWhenChanged`.
- LS-7850's drift auditor has its required input (the e2e surface map) with a
  presence-lint keeping it complete.
- The selection engine is shared with integration — one code path, one set of
  unit tests.

### Harder

- The merge gate is now exposed to **hermetic e2e flake**. With `retries: 0`,
  one flaky test blocks merge until re-run. This is an accepted trade-off
  (chosen explicitly over advisory/shadow rollout); the mitigation is the
  zero-flake program (LS-4421) and `ci:run`-style re-runs.
- Broad-surface PRs now spend **~30 runner-minutes** on e2e (full suite, 3
  shards) instead of ~5. Narrow PRs are largely unchanged (`@critical` + a
  handful of affected specs).
- The map is **hand-maintained**: a new spec must be added to the manifest
  (enforced by the presence-lint), and globs must be kept broad enough to avoid
  under-selection.

### Now constrained

- New e2e specs **cannot merge without a surface-map entry** (presence-lint in
  `custom-checks`).
- The `e2e` job's shard count is now **dynamic** (1 vs 3), driven by
  `detect-changes` outputs; future edits to e2e sharding must go through that
  computation, and the required check must remain the stable-named
  `e2e-affected` aggregation job (never a per-shard name) to avoid the
  variable-context required-check trap.
- Promoting integration into the PR gate is deferred to **LS-7845**; this ADR
  scopes only the hermetic suite.

## Addendum (2026-06-12, LS-7963): the rollout gap window merged a failing PR — closed at the merge queue

### Incident

PR **#5110** (LS-7825) merged to `main` on 2026-06-11 while its head commit's
hermetic E2E checks were failing:

- 19:38:39Z — `🚀 CI Pipeline / E2E Tests (Shard 1/3 & 3/3)` start on head SHA
  `f0c44703e`
- 19:39:06Z — the Enhanced Merge Queue merges the PR
- 19:45–19:46Z — both shards and `🚀 CI Pipeline / e2e-affected` conclude
  **FAILURE** (post-merge)

The failures were real regressions (the LS-7960 profile-settings cluster: 22
failed + 4 flaky at the next nightly). Selection worked exactly as designed —
the surface map picked the right specs and `runAllWhenChanged` ran the full
suite. The merge gate did not hold.

### Root cause

The Rollout section above is the root cause: `🚀 CI Pipeline / e2e-affected`
exists in `.github/ruleset.json` (config) but had not been promoted to the
**live** ruleset (`scripts/apply-ruleset.sh` is an admin action, deliberately
deferred pending @critical flake stabilization — LS-7856). Two enforcement
layers therefore both ignored it:

1. **GitHub** only enforces the live ruleset's 8 required checks, all of which
   were green on the head SHA.
2. **The merge-queue processor** (`.github/scripts/merge-queue-processor.js`)
   evaluates only the required-check set it reads from the live branch-rules
   API — non-required checks are filtered out precisely so nightly/manual
   check runs cannot block the queue. The in-flight (then failing) e2e checks
   were invisible to it, so the queue merged 27 seconds after the e2e shards
   started.

No escape-hatch label or bypass was involved; this was the normal queue path
operating inside the rollout gap window.

### Resolution (LS-7963)

The merge-queue processor now **unions the config-tracked required-check
contexts from the checked-in `.github/ruleset.json` into the live required
set** when evaluating PRs targeting `main` (union-only: config can tighten the
gate beyond the live ruleset, never loosen it; `_staged` rules/checks are
excluded, mirroring `apply-ruleset.sh` and the docs-only shim). A PR whose
head-SHA `e2e-affected` check is failing — or has not yet registered — is now
blocked or held pending by the queue, even before live enforcement.

Trade-off accepted: this makes `e2e-affected` effectively blocking for
queue-driven merges **before** LS-7856 lands, exposing the queue to the two
known flaky `@critical` specs. LS-7856 explicitly sanctions this alternative
("accept frequent `ci:run` re-runs"); the queue self-retries on the next CI
completion, and a re-run that goes green unblocks automatically. The failure
mode is a delayed merge, not a leaked regression.

What this does **not** cover: merges performed outside the queue (manual UI
merges by the bypass actor). Full enforcement still requires a maintainer to
run `bash scripts/apply-ruleset.sh` once LS-7856 stabilizes the flaky specs —
the drift check (`check-ruleset.yml`) continues to report the config/live gap
until then.
