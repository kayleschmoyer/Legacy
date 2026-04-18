#!/bin/bash
# SessionStart hook: warn if any workspace service credentials are missing.
# Non-blocking — prints warnings but never fails the session.
# Complements check-github-auth.sh (which is Linux/cloud-only for GitHub only).

warn_missing() {
  local service="$1"
  local hint="$2"
  echo "WARNING: ${service} credentials not configured. ${hint}"
}

# GitHub
if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ] && [ -z "${AGENT_AUTHOR_APP_PRIVATE_KEY:-}" ]; then
  GH_CACHE="${HOME}/.config/legacy-sports-github/token.json"
  NETRC_FILE="${HOME}/.netrc"
  if [ "$(uname -s)" = "Windows_NT" ]; then
    NETRC_FILE="${HOME}/_netrc"
  fi
  if [ ! -f "${GH_CACHE}" ] && ! grep -q "machine github.com" "${NETRC_FILE}" 2>/dev/null; then
    warn_missing "GitHub" "Set GH_TOKEN in .mcp.json env or run 'gh auth login' in your terminal, then restart the session."
  fi
fi

# Jira — basic or OAuth
if [ -z "${JIRA_API_TOKEN:-}" ] && [ -z "${JIRA_CLIENT_SECRET:-}" ]; then
  NETRC_FILE="${HOME}/.netrc"
  if [ "$(uname -s)" = "Windows_NT" ]; then
    NETRC_FILE="${HOME}/_netrc"
  fi
  if ! grep -qE "machine (atlassian\.net|bkrupa\.atlassian\.net|id\.atlassian\.com)" "${NETRC_FILE}" 2>/dev/null; then
    warn_missing "Jira" "Set JIRA_EMAIL and JIRA_API_TOKEN in .mcp.json env, then restart the session."
  fi
fi

# AWS — only check if aws CLI is available
if command -v aws >/dev/null 2>&1; then
  AWS_PROFILE="${AWS_PROFILE:-default}"
  if ! aws sts get-caller-identity --profile "${AWS_PROFILE}" --output text >/dev/null 2>&1; then
    warn_missing "AWS" "Run 'aws sso login --profile ${AWS_PROFILE}' in your terminal to refresh your SSO session."
  fi
fi
