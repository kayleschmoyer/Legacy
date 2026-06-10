#!/usr/bin/env bash
# build-runner-control-plane-lambda.sh
#
# Builds a PATCHED `runners.zip` (the github-aws-runners control-plane Lambda
# bundle) from upstream source at the version pinned in
# terraform/runners/github-runners.tf, applying terraform/runners/lambda-patches/
# scale-down-heartbeat.patch.
#
# Why we build instead of download (LS-7874/LS-7877): the upstream scale-down
# Lambda de-registers and terminates a runner the instant the GitHub API reports
# it as `busy: false`. That flag is eventually consistent and intermittently
# returns a false-negative for a runner that is actively executing a long job, so
# a single stray reading kills the job mid-run (observed terminating the ~1400s
# integration shard). The module exposes no busy-recheck knob and the only
# busy-independent guard (minimum_running_time_in_minutes) cannot cover a long job
# without pricing out the whole fleet, so we patch the Lambda to honor a
# job-driven heartbeat tag: every self-hosted job tags its own instance with
# `ghr:job_heartbeat=<unix-seconds>` via the runner-level job hooks, and the
# Lambda treats any runner whose heartbeat is fresher than
# SCALE_DOWN_HEARTBEAT_TTL_SECONDS (default 180) as active. See
# terraform/runners/lambda-patches/README.md for the full rationale + maintenance
# contract.
#
# `webhook.zip` and `runner-binaries-syncer.zip` are unpatched and still fetched
# by scripts/download-runner-lambdas.js; only `runners.zip` is built here.
#
# Usage:
#   bash scripts/build-runner-control-plane-lambda.sh          # auto-detect version
#   bash scripts/build-runner-control-plane-lambda.sh 7.5.0    # override version
#
# Requirements: git, node >= 22 (corepack), python3 (zip packaging). Network
# access to github.com (clone + yarn install). Run by `make runner-lambdas-sync`
# and the runner-terraform-apply workflow after the download step.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_FILE="$REPO_ROOT/terraform/runners/github-runners.tf"
PATCH="$REPO_ROOT/terraform/runners/lambda-patches/scale-down-heartbeat.patch"
OUT_DIR="$REPO_ROOT/terraform/runners/lambdas"
UPSTREAM_REPO="https://github.com/github-aws-runners/terraform-aws-github-runner.git"

# ── Resolve the module version pinned in Terraform ───────────────────────────
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(grep -A6 'github-aws-runners/github-runner/aws' "$TF_FILE" \
    | grep -oE 'version[[:space:]]*=[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' \
    | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
fi
if [[ -z "$VERSION" ]]; then
  echo "ERROR: could not resolve github-aws-runners module version from $TF_FILE" >&2
  echo "       pass it explicitly: bash $0 <version>" >&2
  exit 1
fi
echo "Building patched control-plane runners.zip for github-aws-runners v$VERSION"

# ── Clone upstream at the pinned tag (sparse: lambdas only) ──────────────────
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone --depth 1 --branch "v$VERSION" --filter=blob:none --sparse "$UPSTREAM_REPO" "$WORK/src" >/dev/null 2>&1
git -C "$WORK/src" sparse-checkout set lambdas >/dev/null 2>&1

# ── Apply the heartbeat patch (fails loudly if it no longer applies) ─────────
if ! git -C "$WORK/src" apply --verbose "$PATCH"; then
  echo "ERROR: $PATCH did not apply against v$VERSION." >&2
  echo "       The module was likely bumped; re-base the patch on the new source." >&2
  echo "       See terraform/runners/lambda-patches/README.md." >&2
  exit 1
fi

# ── Install workspace deps + build the ncc bundle ────────────────────────────
pushd "$WORK/src/lambdas" >/dev/null
corepack yarn install --immutable
pushd functions/control-plane >/dev/null
corepack yarn build
cp package.json dist/
popd >/dev/null
popd >/dev/null

# ── Package dist/ into runners.zip (top-level entries, matching upstream) ────
mkdir -p "$OUT_DIR"
DIST="$WORK/src/lambdas/functions/control-plane/dist"
python3 - "$DIST" "$OUT_DIR/runners.zip" <<'PY'
import os, sys, zipfile
dist, out = sys.argv[1], sys.argv[2]
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(dist)):
        z.write(os.path.join(dist, name), name)
print(f"wrote {out} ({round(os.path.getsize(out)/1024)} KB)")
PY

# ── Sanity check: the heartbeat-override code must be present in the bundle ───
if ! grep -q "ghr:job_heartbeat" "$DIST/index.js"; then
  echo "ERROR: built bundle is missing the job-heartbeat override code." >&2
  exit 1
fi
echo "Patched control-plane runners.zip ready in terraform/runners/lambdas/ (v$VERSION)"
