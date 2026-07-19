# CI Maestro Sweep — Runbook

The Maestro visual sweep runs in CI as **`.github/workflows/run-maestro-sweep.yml`**
(job logic in **`scripts/ci/maestro-sweep.sh`**). It automates the screenshot-capture
half of `/mobile-qa`: boot an Android emulator, install the dev APK, run the tagged
flows, and upload the `NN-before` / `NN-after` screenshot artifacts the AI judge
consumes. It does **not** run the judge or file Jira tickets — that stays the
human/agent step below.

> Role boundary (ADR-0016): this is the **visual/AI-judging sweep**, not functional
> regression. See the [SKILL role boundary](../SKILL.md) and [ADR-0016](../../../../docs/decisions/0016-test-dependency-injection.md).

## What the workflow does

1. **`gate`** — debounce (schedule-free CI policy, LS-8487). No cron. On a `workflow_run`
   after **Deploy** completes on `main`, runs at most once per
   `MAESTRO_SWEEP_MIN_INTERVAL_HOURS` (repo var, default **156h ≈ weekly**). Set the var
   to `20` for a nightly cadence. Manual `workflow_dispatch` always runs. The debounce
   inspects the prior runs' **"Prepare Sweep"** job conclusion (non-skipped = a real
   attempt), never the run-level conclusion — a debounced run is `success` with all jobs
   skipped, which would otherwise re-arm the debounce forever. Mirrors the `gate` job in
   `run-playwright-tests.yml`.
2. **`prepare`** ("Prepare Sweep") — computes the variant matrix and doubles as the
   debounce marker.
3. **`sweep`** (matrix, `fail-fast: false`) — one leg per variant:
   | Variant | `EXPO_PUBLIC_BYPASS_AUTH` | Maestro tag | Covers |
   | --- | --- | --- | --- |
   | `authenticated` | `true` | `authenticated` | the 6 in-app flows (fake `LOCAL_USER`) |
   | `unauthenticated` | _unset_ | `unauthenticated` | the `login` flow (login screen renders) |

   Each leg builds its own APK (bypass is inlined at build time, so the two variants
   need separate builds — see [maestro/README.md](../../../../maestro/README.md) §Tags),
   boots an x86_64 emulator, runs `maestro test --include-tags=<variant> maestro/`, and
   uploads `maestro/artifacts/**` as `maestro-screenshots-<variant>` (`if: always()`, so
   screenshots survive a flow failure). A failed flow → non-zero exit → **red check** (AC2).

## Build shape — why debug + x86_64

- **Debug, not release**: the auth bypass in `apps/app/src/common/auth/AuthHooks.ts`
  **throws** when `NODE_ENV === 'production'`. A release build sets that; a debug build
  keeps `NODE_ENV=development`, so the bypass is honored. This matches the local
  `pnpm exec nx build-android-debug app` path documented in the README.
- **x86_64 ABI**: the CI emulator is `x86_64`, but a debug build normally ships
  `arm64-v8a` only. The workflow passes
  `extra-gradle-flags: -PreactNativeArchitectures=arm64-v8a,x86_64` to the
  `build-android` composite action; it appends this **after** its own ABI flag and
  Gradle honors the last `-P` value, so the debug APK gains an x86_64 slice and boots.

## Trigger / re-run manually

Actions → **Run Maestro Sweep** → Run workflow. The `variants` input selects
`both` (default), `authenticated`, or `unauthenticated`. Manual dispatch bypasses the
debounce gate.

## Judge the CI artifacts locally

The workflow captures screenshots; judging is downstream. To judge a CI run's output:

1. Download the artifact (`maestro-screenshots-authenticated` /
   `-unauthenticated`) from the run's summary page, or via
   `gh run download <run-id> -n maestro-screenshots-authenticated -D maestro/artifacts`.
2. Run the judge + dedup exactly as in the [SKILL workflow](../SKILL.md#workflow)
   steps 3–5: `node scripts/mobile-qa/judge.mjs …` then
   `node scripts/mobile-qa/bug-filter.mjs …`, then file `filable` findings to Jira per
   [jira-filing.md](jira-filing.md).

## Repo configuration knobs

| Setting                            | Type     | Default          | Effect                                           |
| ---------------------------------- | -------- | ---------------- | ------------------------------------------------ |
| `MAESTRO_SWEEP_MIN_INTERVAL_HOURS` | repo var | `156`            | Debounce window; `20` = nightly.                 |
| `MAESTRO_VERSION`                  | repo var | _unset_ (latest) | Pin the Maestro CLI version for reproducibility. |

Backend `EXPO_PUBLIC_*` values come from the same repo secrets the shipped Android
build uses (`build-android-app.yml`); an unset secret degrades gracefully (empty string)
rather than breaking the build.

## Gotchas

- The emulator provisioning (`reactivecircus/android-emulator-runner`, KVM, AVD cache
  key `avd-api34-x86_64-google_apis`) is shared with the `smoke-android` job in
  `build-android-app.yml` — keep the two in sync rather than diverging.
- The sweep job forces `runs-on: ubuntu-latest` (KVM is only on GH-hosted Linux), so
  JDK/SDK setup steps always run — they are **not** gated on `CI_RUNNER_LABEL` the way
  `build-android-app.yml` gates them.
- Emulator-side logic must live in `scripts/ci/maestro-sweep.sh`, not inline in the
  workflow — the emulator-runner splits multi-line inline `script:` blocks (LS-4755).
