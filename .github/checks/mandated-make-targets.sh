#!/usr/bin/env bash
set -euo pipefail

# Recurrence guard for the "mandated Makefile target missing from make_run's
# allowlist" defect class (LS-10152 AC3; prior instances LS-9642, LS-9027).
# Every Makefile target that AGENTS.md or a skill tells an agent to run must
# be either in ALLOWED_TARGETS (tools/mcp/make-server/src/tools/run-target.ts)
# or explicitly documented as local-only in
# scripts/check-mandated-make-targets.mjs's EXPECTED_LOCAL_ONLY exception
# list — otherwise the documented step is unreachable via MCP and every
# agent that hits it is forced back to raw Bash.
echo "Checking mandated Makefile targets against make_run's allowlist..."
node scripts/check-mandated-make-targets.mjs
echo "Mandated Makefile targets check passed"
