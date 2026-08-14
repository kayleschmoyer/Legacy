#!/usr/bin/env bash
# Cold-start benchmark for LS-9425 (Metro inlineRequires evaluation).
#
# Invoked by `.github/workflows/mobile-startup-benchmark.yml` inside
# reactivecircus/android-emulator-runner's `script:` block. That action splits
# inline scripts line-by-line across separate `sh -c` invocations, which breaks
# multi-line shell constructs — see LS-4755 / scripts/ci/android-boot-smoke.sh.
# Keeping the logic in a single bash file invoked with `bash <path>` bypasses
# that splitter entirely.
#
# Expects:
#   - One *.apk in ./artifacts/ (downloaded by the workflow)
#   - An emulator booted and reachable via adb (emulator-runner does this)
#   - $PKG / $ACTIVITY / $RUNS / $VARIANT may be overridden via env
#   - $OUT_JSON: where to write the result summary (default ./artifacts/startup-<VARIANT>.json)
#
# Method: force-stop, clear logcat, `am start` (no -W — see below), then poll
# the live logcat for ActivityTaskManager's "Displayed <pkg>/<activity>: +Nms"
# line, which Android emits the instant the first frame is drawn. That is the
# de-facto standard cold-start signal and is independent of `am start -W`'s own
# wait-timeout.
#
# `am start -W`'s TotalTime/WaitTime is intentionally NOT used as the metric:
# scripts/ci/android-boot-smoke.sh already documented that `-W` reports
# `Status: timeout` on every run on this exact AVD config (2-core, google_apis,
# release RN bundle held on the splash screen for font loading) — passing and
# failing runs alike. Its self-reported timing therefore carries no signal here.
# "Displayed" is emitted by the platform independently of that timeout and is
# the correct thing to key off.
set -euo pipefail

PKG="${PKG:-com.legacysports.app}"
ACTIVITY="${ACTIVITY:-.MainActivity}"
VARIANT="${VARIANT:-unknown}"
RUNS="${RUNS:-8}"
MIN_OK_RUNS="${MIN_OK_RUNS:-5}"
DISPLAYED_TIMEOUT_SECONDS="${DISPLAYED_TIMEOUT_SECONDS:-45}"
SETTLE_BETWEEN_RUNS_SECONDS="${SETTLE_BETWEEN_RUNS_SECONDS:-3}"
OUT_JSON="${OUT_JSON:-./artifacts/startup-${VARIANT}.json}"

# Same grammar guard as android-boot-smoke.sh.
if ! [[ "$PKG" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]]; then
  echo "❌ Invalid PKG value (must match Android applicationId grammar): $PKG" >&2
  exit 2
fi
if ! [[ "$ACTIVITY" =~ ^\.?[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$ ]]; then
  echo "❌ Invalid ACTIVITY value (must match Android activity name grammar): $ACTIVITY" >&2
  exit 2
fi
for numeric_var in RUNS MIN_OK_RUNS DISPLAYED_TIMEOUT_SECONDS SETTLE_BETWEEN_RUNS_SECONDS; do
  if ! [[ "${!numeric_var}" =~ ^[0-9]+$ ]]; then
    echo "❌ Invalid ${numeric_var} value (must be a non-negative integer): ${!numeric_var}" >&2
    exit 2
  fi
done
if [ "$MIN_OK_RUNS" -gt "$RUNS" ]; then
  echo "❌ MIN_OK_RUNS ($MIN_OK_RUNS) cannot exceed RUNS ($RUNS)" >&2
  exit 2
fi

APK=$(ls ./artifacts/*.apk 2>/dev/null | head -1 || true)
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "❌ No APK found in ./artifacts/" >&2
  ls -la ./artifacts/ || true
  exit 1
fi

echo "🔧 Installing $APK (variant=$VARIANT)"
adb install -r "$APK"

LOGCAT_FILE="./artifacts/logcat-startup-${VARIANT}.txt"
mkdir -p "$(dirname "$LOGCAT_FILE")" "$(dirname "$OUT_JSON")"
: >"$LOGCAT_FILE"
LOGCAT_PID=""

cleanup_logcat() {
  if [ -n "$LOGCAT_PID" ]; then
    kill "$LOGCAT_PID" 2>/dev/null || true
    LOGCAT_PID=""
  fi
}
trap cleanup_logcat EXIT

start_logcat_capture() {
  cleanup_logcat
  adb logcat -c
  adb logcat ActivityTaskManager:I ActivityManager:I ReactNativeJS:V AndroidRuntime:V "${PKG}":V "*:S" \
    >>"$LOGCAT_FILE" 2>&1 &
  LOGCAT_PID=$!
}

# Parses Android's "Displayed <pkg>/<activity>: +Nms" / "+NsNNNms" line into
# milliseconds. Examples seen in the wild: "+934ms", "+2s934ms", "+1s".
displayed_ms() {
  local line ms_part s_part ms
  line="$(grep -a -F "Displayed ${PKG}/${ACTIVITY}:" "$LOGCAT_FILE" 2>/dev/null | tail -1 || true)"
  [ -z "$line" ] && return 1
  s_part="$(echo "$line" | grep -oE '[0-9]+s' | grep -oE '[0-9]+' || true)"
  ms_part="$(echo "$line" | grep -oE '[0-9]+ms' | grep -oE '[0-9]+' || true)"
  ms=0
  [ -n "$s_part" ] && ms=$((ms + s_part * 1000))
  [ -n "$ms_part" ] && ms=$((ms + ms_part))
  [ "$ms" -eq 0 ] && return 1
  echo "$ms"
  return 0
}

app_pid() {
  adb shell pidof "${PKG}" 2>/dev/null | tr -d '\r\n' | awk '{print $1}' || true
}

echo "🏁 Benchmarking cold start: variant=$VARIANT runs=$RUNS pkg=$PKG/$ACTIVITY"

RESULTS=()
for run in $(seq 1 "$RUNS"); do
  echo ""
  echo "▶️  Run ${run}/${RUNS}"

  # Ensure a genuine cold start: force-stop kills the process so the next
  # `am start` re-runs process/application init (module evaluation included),
  # not just an Activity re-create on a warm process.
  adb shell am force-stop "$PKG" || true
  sleep 1

  start_logcat_capture
  adb shell am start -n "${PKG}/${ACTIVITY}" >/dev/null 2>&1 || true

  deadline=$((SECONDS + DISPLAYED_TIMEOUT_SECONDS))
  ms=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ms="$(displayed_ms)"; then
      break
    fi
    if [ -z "$(app_pid)" ]; then
      echo "   ⚠️  process not present while waiting for Displayed — possible crash, skipping run"
      ms=""
      break
    fi
    sleep 1
  done

  cleanup_logcat

  if [ -z "$ms" ]; then
    echo "   ⚠️  Run ${run}: no 'Displayed' line within ${DISPLAYED_TIMEOUT_SECONDS}s — discarded"
  else
    echo "   ✅ Run ${run}: ${ms}ms (Displayed)"
    RESULTS+=("$ms")
  fi

  sleep "$SETTLE_BETWEEN_RUNS_SECONDS"
done

OK_COUNT="${#RESULTS[@]}"
echo ""
echo "📊 ${OK_COUNT}/${RUNS} runs produced a Displayed timestamp: ${RESULTS[*]:-none}"

if [ "$OK_COUNT" -lt "$MIN_OK_RUNS" ]; then
  echo "❌ Only ${OK_COUNT} usable runs, need at least ${MIN_OK_RUNS}. Failing the benchmark leg." >&2
  echo "=== Tail of last logcat capture ($LOGCAT_FILE) ===" >&2
  tail -100 "$LOGCAT_FILE" >&2 || true
  exit 1
fi

# Median of the successful runs (sort numerically, take the middle; average
# the two middle values on an even count).
SORTED=($(printf '%s\n' "${RESULTS[@]}" | sort -n))
N="${#SORTED[@]}"
if [ $((N % 2)) -eq 1 ]; then
  MEDIAN="${SORTED[$((N / 2))]}"
else
  A="${SORTED[$((N / 2 - 1))]}"
  B="${SORTED[$((N / 2))]}"
  MEDIAN=$(( (A + B) / 2 ))
fi

echo "📈 Median cold start (variant=${VARIANT}): ${MEDIAN}ms"

RESULTS_JSON="[$(printf '%s,' "${RESULTS[@]}" | sed 's/,$//')]"
cat >"$OUT_JSON" <<EOF
{
  "variant": "${VARIANT}",
  "pkg": "${PKG}",
  "activity": "${ACTIVITY}",
  "runs_requested": ${RUNS},
  "runs_ok": ${OK_COUNT},
  "median_ms": ${MEDIAN},
  "samples_ms": ${RESULTS_JSON}
}
EOF

{
  echo "## 📱 Cold-start benchmark — ${VARIANT}"
  echo "- **Median (of ${OK_COUNT}/${RUNS} runs):** ${MEDIAN}ms"
  echo "- **Samples (ms):** ${RESULTS[*]}"
} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "✅ Wrote ${OUT_JSON}"
