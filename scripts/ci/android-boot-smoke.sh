#!/usr/bin/env bash
# Android APK boot-smoke check (LS-4749 / LS-4755).
#
# Invoked by `.github/workflows/build-android-app.yml` inside
# reactivecircus/android-emulator-runner's `script:` block. The action
# splits inline scripts line-by-line across separate `sh -c` invocations,
# which breaks multi-line shell constructs (`if/then/fi`, `for` loops,
# variable continuity across lines) — see LS-4755. Keeping the logic
# in a single bash file invoked with `bash <path>` from the workflow
# bypasses that splitter entirely.
#
# Expects:
#   - One *.apk in ./artifacts/ (downloaded by the workflow)
#   - An emulator booted and reachable via adb (emulator-runner does this)
#   - $PKG / $ACTIVITY may be overridden via env; defaults match the
#     applicationId in apps/app/app.json and the generated AndroidManifest.
#
# Exits non-zero on crash; dumps relevant logcat tags to stdout before exit.

set -euo pipefail

PKG="${PKG:-com.legacySports}"
ACTIVITY="${ACTIVITY:-.MainActivity}"
SETTLE_SECONDS="${SETTLE_SECONDS:-15}"

# Validate PKG/ACTIVITY before they reach `adb shell` (which forwards
# args through /system/bin/sh -c on the device). Even though defaults
# are hardcoded and only workflow maintainers can set the env vars,
# we reject anything outside the Android identifier grammar so a future
# override from a less-trusted source can't smuggle shell metacharacters
# into the remote shell. Android applicationId / activity name grammar
# is `[A-Za-z0-9._]+` (with an optional leading `.` on the activity).
if ! [[ "$PKG" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]]; then
  echo "❌ Invalid PKG value (must match Android applicationId grammar): $PKG" >&2
  exit 2
fi
if ! [[ "$ACTIVITY" =~ ^\.?[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$ ]]; then
  echo "❌ Invalid ACTIVITY value (must match Android activity name grammar): $ACTIVITY" >&2
  exit 2
fi
if ! [[ "$SETTLE_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "❌ Invalid SETTLE_SECONDS value (must be a non-negative integer): $SETTLE_SECONDS" >&2
  exit 2
fi

APK=$(ls ./artifacts/*.apk 2>/dev/null | head -1 || true)
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "❌ No APK found in ./artifacts/"
  ls -la ./artifacts/ || true
  exit 1
fi

echo "🔧 Installing $APK"
adb install -r "$APK"

echo "🧹 Clearing logcat buffer before launch"
adb logcat -c

# Tee logcat to a file from launch onward so the full multi-line ErrorBoundary
# error body survives ring-buffer eviction. Filtering with `*:S` here would
# silently drop the ReactNativeJS error context object's continuation lines on
# some logcat builds, so we capture verbose and grep it on failure.
LOGCAT_FILE="${LOGCAT_FILE:-./artifacts/logcat-boot.txt}"
mkdir -p "$(dirname "$LOGCAT_FILE")"
adb logcat ReactNativeJS:V AndroidRuntime:V "${PKG}":V "*:S" > "$LOGCAT_FILE" 2>&1 &
LOGCAT_PID=$!
# Stop the background logcat when this script exits for any reason so it
# doesn't outlive the emulator shutdown step.
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT

echo "🚀 Launching ${PKG}/${ACTIVITY}"
adb shell am start -W -n "${PKG}/${ACTIVITY}"

echo "⏳ Waiting ${SETTLE_SECONDS}s for app to settle..."
sleep "${SETTLE_SECONDS}"

# pidof returns nonzero when the process is gone; suppress with || true so
# `set -e` doesn't kill us before we can dump logcat.
PID=$(adb shell pidof "${PKG}" | tr -d '\r\n' || true)
if [ -z "${PID}" ]; then
  echo "❌ App process not running — APK crashed on launch"
  echo ""
  echo "=== Captured logcat since launch ($LOGCAT_FILE) ==="
  cat "$LOGCAT_FILE" || true
  echo ""
  echo "=== Last 200 lines of full logcat ==="
  adb logcat -d -t 200 || true
  exit 1
fi

# Process being alive is not enough: the React ErrorBoundary catches JS throws
# during initial render and swaps in a fallback UI, leaving the native process
# running. `pidof` would report success even though the user sees only
# "Oops! Something went wrong". Scan logcat for the boundary's marker string
# (LOGGER.error('Error Boundary caught an error', ...) in
# lib/shared-components/src/components/ErrorBoundary.tsx -> console.error ->
# ReactNativeJS:E in logcat) and fail if it appears within the settle window.
# Check both the captured file (full context, survives eviction) and the
# live ring buffer (defensive fallback in case the background tee failed
# silently). Either source detecting a hit is sufficient to fail the run.
BOUNDARY_HITS_FILE=$(grep -F "Error Boundary caught an error" "$LOGCAT_FILE" 2>/dev/null || true)
BOUNDARY_HITS_BUFFER=$(adb logcat -d ReactNativeJS:E "*:S" | grep -F "Error Boundary caught an error" || true)
BOUNDARY_HITS="${BOUNDARY_HITS_FILE:-$BOUNDARY_HITS_BUFFER}"
if [ -n "${BOUNDARY_HITS}" ]; then
  echo "❌ React ErrorBoundary tripped during boot — app rendered fallback UI instead of the app"
  echo ""
  echo "=== Boundary log lines ==="
  echo "${BOUNDARY_HITS}"
  echo ""
  echo "=== Full captured logcat since launch ($LOGCAT_FILE) ==="
  cat "$LOGCAT_FILE" || true
  exit 1
fi

echo "✅ App running (pid=$PID), no ErrorBoundary trip — boot smoke passed"
