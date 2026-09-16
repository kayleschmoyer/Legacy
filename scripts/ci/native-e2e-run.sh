#!/usr/bin/env bash
# Native (Android/Appium) E2E runner — LS-8450 / ADR-0016 native blueprint step 4.
#
# Invoked by `.github/workflows/e2e-native-android.yml` inside
# reactivecircus/android-emulator-runner's `script:` block (emulator already
# booted, adb on PATH, node/pnpm/node_modules ready from prior job steps).
#
# Kept as a single bash file invoked with `bash <path>` because the
# emulator-runner splits inline multi-line `script:` blocks across separate
# `sh -c` calls, breaking if/then/fi and background-process continuity (LS-4755,
# same reason as scripts/ci/android-boot-smoke.sh).
#
# It exports the native harness env the shared suite gates on
# (E2E_NATIVE_APP + Appium coordinates — see apps/web-e2e/src/driver/appium-env.ts),
# starts an Appium (UiAutomator2) server, and runs the proof flows (login →
# league list; football roster bench↔starter lineup assignment — LS-9656)
# through the existing native `AppDriver` seam. Appium installs + launches
# the APK itself via the `appium:app` capability that createAndroidSession()
# derives from E2E_NATIVE_APP. A non-zero exit reddens the job = the
# "watched" red check.
set -uo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-./artifacts}"
APPIUM_PORT="${APPIUM_PORT:-4723}"
APPIUM_LOG="${APPIUM_LOG:-$ARTIFACT_DIR/appium.log}"
PW_CONFIG="apps/web-e2e/playwright.native.config.ts"
# The native proof specs (LS-9656 generalized this from a single hardcoded
# spec to a list): "login → league list" (bypass build lands authenticated,
# then the shared LeaguePage drives the league-discovery / list surface) plus
# the football roster bench↔starter lineup assignment
# (`lib/shared-components/src/features/roster/**`), plus (LS-6441) the
# lock-window and bye-week conditional-state specs — same shared
# `RosterBoard`/`TestData.footballLineup*()` machinery, so they are as
# native-capable as the bench↔starter spec above. LS-9657 adds the Team Detail
# lineup journey, which drives the SAME `RosterBoard` on the football team
# screen's Lineup tab (`apps/app/src/app/(app)/football/team/[teamId].tsx`) —
# reached through the driver route map's `initialTab=Lineup` rewrite — and adds
# the read-only visitor case the League Roster tab cannot exercise. Add further
# specs here as more surfaces get native proof coverage.
PROOF_SPECS=(
  "league-discovery-search.dual.spec.ts"
  "football-lineup.dual.spec.ts"
  "football-lineup-lock-window.dual.spec.ts"
  "football-lineup-bye-week.dual.spec.ts"
  "football-team-detail-lineup.dual.spec.ts"
)

mkdir -p "$ARTIFACT_DIR"

# ── 1. Locate the bypass APK and export the native harness env ────────
APK=$(ls "$ARTIFACT_DIR"/*.apk 2>/dev/null | head -1 || true)
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "❌ No APK found in $ARTIFACT_DIR/"
  ls -la "$ARTIFACT_DIR/" || true
  exit 1
fi
# appium-env.ts treats the presence of E2E_NATIVE_APP as the "emulator harness
# configured" signal; createAndroidSession installs it via appium:app.
export E2E_NATIVE_APP
E2E_NATIVE_APP="$(readlink -f "$APK")"
export E2E_NATIVE_APP_PACKAGE="${E2E_NATIVE_APP_PACKAGE:-com.legacysports.app}"
export APPIUM_HOST="127.0.0.1"
export APPIUM_PORT
echo "🔧 Native harness APK: $E2E_NATIVE_APP"

# Hermetic backend (ADR-0017 — LS-8448): the per-worker GraphQL mock server is
# booted in-process by the Playwright `nativeMockServer` fixture, which also runs
# `adb reverse tcp:${E2E_NATIVE_GRAPHQL_PORT} tcp:<dynamicHostPort>`. The bypass
# APK must be built with
# EXPO_PUBLIC_GRAPHQL_HOST=http://localhost:${E2E_NATIVE_GRAPHQL_PORT}/graphql so
# the emulator app reaches the mapped server. Keep this port in sync with the APK
# build (build-android-app.yml).
export E2E_NATIVE_GRAPHQL_PORT="${E2E_NATIVE_GRAPHQL_PORT:-8083}"
echo "🔧 Native GraphQL device port (adb reverse target): $E2E_NATIVE_GRAPHQL_PORT"

# createAndroidSession's `appium:platformVersion` capability requires an exact
# match against the booted emulator or Appium 500s the session (LS-10089:
# appium-env.ts's hardcoded '13' default drifted from the ANDROID_API_LEVEL 35
# image this workflow actually boots — Android 15). Querying the connected
# device directly, rather than hardcoding a second guess here, keeps this in
# sync with whatever image android-emulator-runner boots for `api-level` above.
ANDROID_PLATFORM_VERSION=$(adb shell getprop ro.build.version.release | tr -d '\r\n')
export ANDROID_PLATFORM_VERSION
echo "🔧 Detected emulator OS version: $ANDROID_PLATFORM_VERSION"

# ── 2. Start Appium (UiAutomator2) ────────────────────────────────────
echo "🔌 Ensuring Appium UiAutomator2 driver is installed"
pnpm exec appium driver install uiautomator2 2>/dev/null \
  || pnpm exec appium driver list --installed || true

echo "🚀 Starting Appium server on port $APPIUM_PORT (log: $APPIUM_LOG)"
pnpm exec appium --address 127.0.0.1 --port "$APPIUM_PORT" \
  --relaxed-security --log-timestamp --log "$APPIUM_LOG" &
APPIUM_PID=$!
trap 'kill "$APPIUM_PID" 2>/dev/null || true' EXIT

echo "⏳ Waiting for Appium to become ready..."
READY=""
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${APPIUM_PORT}/status" >/dev/null 2>&1; then
    READY="yes"
    break
  fi
  sleep 2
done
if [ -z "$READY" ]; then
  echo "❌ Appium did not become ready within ~120s"
  echo "=== Appium log ==="
  cat "$APPIUM_LOG" 2>/dev/null || true
  exit 1
fi
echo "✅ Appium ready"

# ── 3. Run the proof flows through the native project ──────────────────
echo "🧪 Running native E2E: $PW_CONFIG (--project=native-android, ${PROOF_SPECS[*]})"
pnpm exec playwright test --config="$PW_CONFIG" \
  --project=native-android "${PROOF_SPECS[@]}"
TEST_EXIT=$?

if [ "$TEST_EXIT" -ne 0 ]; then
  echo "❌ Native E2E failed (exit $TEST_EXIT)"
  echo "=== Tail of Appium log ==="
  tail -100 "$APPIUM_LOG" 2>/dev/null || true
else
  echo "✅ Native E2E passed"
fi

exit "$TEST_EXIT"
