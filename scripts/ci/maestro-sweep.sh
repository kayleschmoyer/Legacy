#!/usr/bin/env bash
# Maestro visual/AI-judging sweep (LS-8445).
#
# Invoked by `.github/workflows/run-maestro-sweep.yml` inside
# reactivecircus/android-emulator-runner's `script:` block. The action splits
# inline scripts line-by-line across separate `sh -c` invocations, which breaks
# multi-line shell constructs (`if/then/fi`, `for` loops, variable continuity) —
# see LS-4755 and scripts/ci/android-boot-smoke.sh. Keeping the logic in a single
# bash file invoked with `bash <path>` bypasses that splitter entirely.
#
# Expects (via env, set by the workflow):
#   - APK_PATH : path to the built APK to install (required)
#   - TAGS     : Maestro --include-tags value, e.g. "authenticated" (required)
#   - PKG      : applicationId (optional; defaults to com.legacysports.app)
#   - An emulator booted and reachable via adb (emulator-runner does this)
#   - `maestro` on PATH (installed by the workflow's "Install Maestro" step)
#
# Screenshots are written by the flows to maestro/artifacts/<page>/NN-<state>
# relative to the CWD, so this MUST run from the repo root — the emulator-runner
# invokes its `script:` in the workspace dir, which is the repo root.
#
# A non-zero exit (Maestro flow failure) fails the job → red check (AC2). The
# workflow uploads maestro/artifacts/** with `if: always()` so screenshots
# captured before the failure are still available for AI judging.

set -euo pipefail

PKG="${PKG:-com.legacysports.app}"
: "${TAGS:?TAGS env is required (e.g. authenticated)}"
: "${APK_PATH:?APK_PATH env is required}"

# Validate inputs before they reach the `maestro` / `adb` CLIs. Defaults are
# hardcoded and only workflow maintainers can set these, but we reject anything
# outside the expected grammar so a future override from a less-trusted source
# can't smuggle shell metacharacters into a subshell.
# Maestro tags are lowercase slugs, optionally comma-separated (config uses
# hyphenated page slugs like `trade-center` plus `authenticated`/`unauthenticated`).
if ! [[ "$TAGS" =~ ^[a-z0-9]+(-[a-z0-9]+)*(,[a-z0-9]+(-[a-z0-9]+)*)*$ ]]; then
  echo "❌ Invalid TAGS value (expected comma-separated lowercase slugs): $TAGS" >&2
  exit 2
fi
# Android applicationId grammar is `[A-Za-z0-9._]+` with dotted segments.
if ! [[ "$PKG" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]]; then
  echo "❌ Invalid PKG value (must match Android applicationId grammar): $PKG" >&2
  exit 2
fi

if [ ! -f "$APK_PATH" ]; then
  echo "❌ APK not found at $APK_PATH" >&2
  ls -la "$(dirname "$APK_PATH")" 2>/dev/null || true
  exit 1
fi

echo "🔧 Installing $APK_PATH"
adb install -r "$APK_PATH"

echo "🔎 Maestro: $(maestro --version 2>/dev/null || echo 'version unknown')"
echo "🎬 Running Maestro sweep — --include-tags=${TAGS} (app: ${PKG})"

# `maestro test` runs every flow whose tags match --include-tags. Screenshots
# land under maestro/artifacts/<page>/ (CWD-relative). No AI judging here — that
# is the downstream /mobile-qa step that consumes these artifacts.
maestro test --include-tags="$TAGS" maestro/

echo "✅ Maestro sweep completed for tags: ${TAGS}"
