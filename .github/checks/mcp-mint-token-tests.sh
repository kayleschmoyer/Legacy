#!/usr/bin/env bash
set -euo pipefail

# Unit tests for scripts/mcp-mint-token.mjs — the Claude Code headersHelper
# that mints short-lived MCP bearer tokens via a Cognito client_credentials
# grant (LS-5092). Covers successful mint, missing-secret, Cognito-error, and
# the secret-never-on-stdout security gate.
echo "Running mcp-mint-token unit tests..."
node --test scripts/__tests__/mcp-mint-token.test.mjs
echo "mcp-mint-token tests passed"
