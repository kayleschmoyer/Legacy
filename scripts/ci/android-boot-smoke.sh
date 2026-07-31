#!/usr/bin/env bash
# Android APK boot-smoke check (LS-4749 / LS-4755 / LS-8821).
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
#
# ── Why liveness is polled rather than sampled once (LS-8821) ────────────────
# The original check slept a fixed 15s and then took a single `pidof` sample.
# That produced a false "APK crashed on launch" on run #1821: the identical
# commit passed on re-run, and the app process was simply absent at the one
# moment we happened to look. Two properties of this environment make a single
# sample unreliable:
#
#   1. `am start -W` reports `Status: timeout` on EVERY run, passing and
#      failing alike (WaitTime ~12-13s). The app is still on the splash screen
#      when `am start` gives up — expo-splash-screen is held until the six
#      brand fonts resolve, and a release RN bundle on a 2-core AVD needs
#      longer than adb's launch-wait budget. So `am start`'s verdict carries no
#      signal here and must not be treated as one.
#   2. The AVD boots `google_apis`, so Play Services churns hard for the first
#      minute after boot. Run #1821 logged binder allocation failures
#      ("cannot allocate buffer: no space left") seconds before our process
#      vanished — the signature of a memory-pressured guest, where lmkd is
#      free to reap a freshly-launched foreground app.
#
# So: wait for the process to appear, then require it to stay alive across the
# whole settle window (sampled every POLL_INTERVAL). This is STRICTER than the
# old single sample — a death at any point in the window is caught, not just a
# death before the final instant — and a pid change is caught too, which the
# old check could not see at all.
#
# ── Why some deaths are retried and others are not ──────────────────────────
# A retry must never paper over a real crash. `classify_death` reads the
# captured logcat and only permits a retry when the death is attributable to
# the *host environment* (lmkd / ActivityManager reaping us under pressure) or
# is entirely unexplained. Any genuine crash signature — a Java/JS
# `FATAL EXCEPTION` or a native tombstone — fails immediately with no retry,
# because those are reproducible app defects and retrying would hide them.
set -euo pipefail

PKG="${PKG:-com.legacysports.app}"
ACTIVITY="${ACTIVITY:-.MainActivity}"
# How long the process must stay continuously alive to count as a healthy boot.
SETTLE_SECONDS="${SETTLE_SECONDS:-20}"
# How long to wait for the process to appear at all after `am start` returns.
START_TIMEOUT_SECONDS="${START_TIMEOUT_SECONDS:-45}"
# Total launch attempts, including the first. Only environment-attributable
# deaths consume one; real crashes fail on the first attempt.
LAUNCH_ATTEMPTS="${LAUNCH_ATTEMPTS:-2}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-2}"

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
for numeric_var in SETTLE_SECONDS START_TIMEOUT_SECONDS LAUNCH_ATTEMPTS POLL_INTERVAL_SECONDS; do
  if ! [[ "${!numeric_var}" =~ ^[0-9]+$ ]]; then
    echo "❌ Invalid ${numeric_var} value (must be a non-negative integer): ${!numeric_var}" >&2
    exit 2
  fi
done
if [ "$LAUNCH_ATTEMPTS" -lt 1 ]; then
  echo "❌ LAUNCH_ATTEMPTS must be at least 1: $LAUNCH_ATTEMPTS" >&2
  exit 2
fi
# A zero interval would spin the poll loops against adb with no pause.
if [ "$POLL_INTERVAL_SECONDS" -lt 1 ]; then
  echo "❌ POLL_INTERVAL_SECONDS must be at least 1: $POLL_INTERVAL_SECONDS" >&2
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

LOGCAT_FILE="${LOGCAT_FILE:-./artifacts/logcat-boot.txt}"
mkdir -p "$(dirname "$LOGCAT_FILE")"
LOGCAT_PID=""

# Stop the background logcat when this script exits for any reason so it
# doesn't outlive the emulator shutdown step.
cleanup_logcat() {
  if [ -n "$LOGCAT_PID" ]; then
    kill "$LOGCAT_PID" 2>/dev/null || true
    LOGCAT_PID=""
  fi
}
trap cleanup_logcat EXIT

# Tags captured, and why each is load-bearing. The old filter was
# `ReactNativeJS:V AndroidRuntime:V ${PKG}:V *:S`, which silenced every tag
# that could explain a process disappearing — so run #1821 failed with
# "APK crashed on launch" and not one line of evidence for or against it.
#
#   ReactNativeJS / AndroidRuntime  JS console output and Java fatal exceptions
#   ${PKG}                          anything the app logs under its own tag
#   DEBUG / libc                    native tombstone header + abort messages
#   lmkd                            low-memory killer reaping our process
#   ActivityManager / ActivityTaskManager
#                                   "Killing <pid>:<pkg> (adj N)" process deaths
#   Zygote                          fork/start failures before the app runs
#
# Kept verbose (not `:E`) because the ErrorBoundary error body is multi-line
# and continuation lines drop at higher severity filters on some logcat builds.
start_logcat_capture() {
  cleanup_logcat
  adb logcat -c
  adb logcat \
    ReactNativeJS:V AndroidRuntime:V "${PKG}":V \
    DEBUG:V libc:V lmkd:V Zygote:V \
    ActivityManager:I ActivityTaskManager:I \
    "*:S" >"$LOGCAT_FILE" 2>&1 &
  LOGCAT_PID=$!
}

# `pidof` prints space-separated pids and exits non-zero when the process is
# gone; `|| true` keeps `set -e` from killing us before diagnostics are dumped.
app_pid() {
  adb shell pidof "${PKG}" 2>/dev/null | tr -d '\r\n' | awk '{print $1}' || true
}

logcat_matches() {
  grep -a -F -- "$1" "$LOGCAT_FILE" 2>/dev/null || true
}

# Classifies a process death from the captured logcat. Echoes one of:
#   crash        a real app defect — fail now, never retry
#   environment  the host reaped us (lmkd / AM under memory pressure) — retryable
#   unknown      nothing conclusive in the log — retryable, reported as such
classify_death() {
  if [ -n "$(logcat_matches 'FATAL EXCEPTION')" ]; then
    echo "crash"
  elif [ -n "$(logcat_matches ">>> ${PKG} <<<")" ]; then
    echo "crash"
  elif [ -n "$(grep -a -E "lmkd .*(Kill|kill).*${PKG}" "$LOGCAT_FILE" 2>/dev/null || true)" ]; then
    echo "environment"
  elif [ -n "$(grep -a -E "Killing [0-9]+:${PKG}" "$LOGCAT_FILE" 2>/dev/null || true)" ]; then
    echo "environment"
  else
    echo "unknown"
  fi
}

dump_diagnostics() {
  echo ""
  echo "=== Captured logcat since launch ($LOGCAT_FILE) ==="
  cat "$LOGCAT_FILE" || true
  echo ""
  # Filtered rather than the old unfiltered `-t 200`: on a google_apis AVD the
  # tail is 200 lines of Play Services noise that pushed the actual cause out
  # of the buffer on run #1821.
  echo "=== Recent process-death / crash lines from the live buffer ==="
  adb logcat -d -t 400 \
    AndroidRuntime:V DEBUG:V libc:V lmkd:V \
    ActivityManager:I ActivityTaskManager:I "*:S" || true
}

# Waits for the app to appear and then stay alive. Echoes the surviving pid on
# success; returns 1 (with the reason on stderr) if it never started, died, or
# restarted under a new pid.
await_healthy_process() {
  local deadline pid first_pid current
  deadline=$(( SECONDS + START_TIMEOUT_SECONDS ))
  pid=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    pid="$(app_pid)"
    [ -n "$pid" ] && break
    sleep "$POLL_INTERVAL_SECONDS"
  done

  if [ -z "$pid" ]; then
    echo "process never appeared within ${START_TIMEOUT_SECONDS}s of launch" >&2
    return 1
  fi

  first_pid="$pid"
  echo "   process up as pid=${first_pid}; holding for ${SETTLE_SECONDS}s..." >&2

  deadline=$(( SECONDS + SETTLE_SECONDS ))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sleep "$POLL_INTERVAL_SECONDS"
    current="$(app_pid)"
    if [ -z "$current" ]; then
      echo "process died after ${first_pid} came up" >&2
      return 1
    fi
    if [ "$current" != "$first_pid" ]; then
      # A new pid means the app crashed and Android restarted it — invisible to
      # the old single-sample check, which would have seen a live pid and passed.
      echo "process restarted (pid ${first_pid} -> ${current}) — crash loop" >&2
      return 1
    fi
  done

  echo "$first_pid"
  return 0
}

attempt=1
while [ "$attempt" -le "$LAUNCH_ATTEMPTS" ]; do
  echo "🧹 Clearing logcat buffer and starting capture (attempt ${attempt}/${LAUNCH_ATTEMPTS})"
  start_logcat_capture

  echo "🚀 Launching ${PKG}/${ACTIVITY}"
  # `am start -W` reports `Status: timeout` on healthy runs too (see header), so
  # its exit status and verdict are informational only — liveness is the check.
  adb shell am start -W -n "${PKG}/${ACTIVITY}" || true

  echo "⏳ Verifying the app stays alive..."
  if PID="$(await_healthy_process)"; then
    break
  fi

  verdict="$(classify_death)"
  if [ "$verdict" = "crash" ]; then
    echo "❌ App crashed on launch — fatal exception or native tombstone in logcat"
    dump_diagnostics
    exit 1
  fi

  if [ "$attempt" -ge "$LAUNCH_ATTEMPTS" ]; then
    if [ "$verdict" = "environment" ]; then
      echo "❌ App process was killed by the system (low memory) on every attempt."
      echo "   No app crash signature was found — this is emulator resource pressure,"
      echo "   not necessarily an APK defect. Consider raising AVD ram-size/cores."
    else
      echo "❌ App did not stay running, and logcat shows no crash or kill signature."
    fi
    dump_diagnostics
    exit 1
  fi

  echo "⚠️  Attempt ${attempt} failed (${verdict}) — no crash signature, retrying."
  attempt=$(( attempt + 1 ))
done

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
BOUNDARY_HITS_FILE=$(logcat_matches "Error Boundary caught an error")
BOUNDARY_HITS_BUFFER=$(adb logcat -d ReactNativeJS:E "*:S" | grep -a -F "Error Boundary caught an error" || true)
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

echo "✅ App running (pid=$PID) and stable for ${SETTLE_SECONDS}s, no ErrorBoundary trip — boot smoke passed"
