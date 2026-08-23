#!/usr/bin/env bash
set -euo pipefail

# Nightly flaky-test → Jira filing unit tests (LS-9659). Exercises the
# spec grouping, canonical-summary dedup, occurrence counting, and the
# ADF description/comment builders used by the file-flaky-tickets job.
echo "Running flaky-ticket filing tests..."
node --test .github/scripts/flaky-tickets/__tests__/*.test.mjs
echo "flaky-ticket filing tests passed"
