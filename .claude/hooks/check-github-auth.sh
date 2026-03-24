#!/bin/bash
# SessionStart hook: warn if GitHub auth is not configured.
# Non-blocking — prints a warning but never fails the session.

# Skip on Windows local dev — gh auth login handles it
if [ "$(uname -s)" = "Linux" ] && [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
    if ! gh auth status >/dev/null 2>&1; then
      echo "WARNING: GitHub is not authenticated. PR creation will fail."
      echo "  Set AGENT_AUTHOR_APP_PRIVATE_KEY in cloud env settings and use .claude/cloud-setup.sh"
      echo "  Or set GH_TOKEN directly. See .agents/skills/cloud-github-auth/SKILL.md"
    fi
  fi
fi
