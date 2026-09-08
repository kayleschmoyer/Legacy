#!/bin/bash
# MCP-server precondition check (LS-3022).
#
# Invoked at the END of setup-worktree-symlink.sh — never registered as a
# standalone SessionStart hook. Sequential invocation (LS-4505) avoids races
# between symlink setup and precondition checks; no retries or sleeps needed.
#
# Can still be invoked ad-hoc for diagnostics: bash .claude/hooks/check-mcp-servers.sh
#
# The stdio legacy-sports MCP servers launch via mcp-bootstrap.mjs → pnpm exec tsx.
# The three hosted servers (jira, github, ci) connect via OAuth custom remote
# connectors registered in claude.ai — they do not use tsx and are not in .mcp.json.
# If node_modules/.bin/tsx is absent, the stdio servers silently time out — the
# agent receives an empty deferred tools list and may fall back to gh/git/make
# without knowing why.  This script surfaces the failure proactively so the agent
# can report and request a repair rather than proceeding with degraded tooling.
#
# tsx alone under-detects a half-installed node_modules (LS-9577): an install
# that dies partway through can leave tsx present while node_modules/.modules.yaml
# and node_modules/.bin/nx are still missing, so every nx-backed pc-* chunk fails
# even though this check would otherwise report healthy. All three artifacts are
# checked together below.
#
# Non-worktree sessions (cloud agents, Claude Code Remote) that are found
# definitively BROKEN (not merely mid-install — see LS-4505 on why the
# mid-install case is left alone) get an immediate, bounded auto-repair
# attempt (`pnpm install --frozen-lockfile`, LS-8723) instead of only a
# printed instruction: this is the fourth+ documented recurrence of the
# LS-8113/LS-8363 symptom class where the prior fix detected the condition
# but never acted on it, leaving repair to whichever agent happened to read
# the warning and run the command itself.
#
# Non-blocking — prints warnings but never fails the session (exits 0).

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Determine whether this is a native-worktree session and find the main repo.
MAIN_REPO=""
if [[ "$WORKTREE" == *"/.claude/worktrees/"* ]]; then
  MAIN_REPO=$(echo "$WORKTREE" | sed 's|/.claude/worktrees/[^/]*$||')
elif [[ "$(basename "$(dirname "$WORKTREE")")" == *.worktrees ]]; then
  PARENT_DIR=$(dirname "$WORKTREE")
  ROOT_DIR=$(dirname "$PARENT_DIR")
  MAIN_REPO_NAME=$(basename "$PARENT_DIR" | sed 's|\.worktrees$||')
  MAIN_REPO="$ROOT_DIR/$MAIN_REPO_NAME"
fi

IS_WORKTREE=false
if [ -n "$MAIN_REPO" ]; then
  IS_WORKTREE=true
fi

WARNINGS=()

# --- 1. node_modules/.bin/tsx, node_modules/.modules.yaml, node_modules/.bin/nx
# Use -f (follows symlinks) rather than "! -f && ! -L" so that a broken symlink
# (pnpm stores binaries as symlinks) also triggers the warning. With "! -L",
# a broken symlink would pass silently: -L is true for any symlink, broken or not.
#
# tsx alone is not a reliable install-health signal (LS-9577): a `pnpm install`
# that dies partway through (e.g. puppeteer's postinstall failing to download
# Chrome in a network-sandboxed container) can leave tsx materialised while
# node_modules/.modules.yaml — what nx's pnpm-lockfile parser keys on — and
# node_modules/.bin/nx are still missing or broken, so every nx-backed pc-*
# chunk fails even though the tsx check alone would report healthy. Check all
# three.
TSX="$WORKTREE/node_modules/.bin/tsx"
MODULES_YAML="$WORKTREE/node_modules/.modules.yaml"
NX_BIN="$WORKTREE/node_modules/.bin/nx"
MISSING_ARTIFACTS=()
[ ! -f "$TSX" ] && MISSING_ARTIFACTS+=("node_modules/.bin/tsx")
[ ! -f "$MODULES_YAML" ] && MISSING_ARTIFACTS+=("node_modules/.modules.yaml")
[ ! -f "$NX_BIN" ] && MISSING_ARTIFACTS+=("node_modules/.bin/nx")

if [ ${#MISSING_ARTIFACTS[@]} -gt 0 ]; then
  MISSING_LIST=$(
    IFS=,
    echo "${MISSING_ARTIFACTS[*]}" | sed 's/,/, /g'
  )
  WARNINGS+=("[MCP WARNING] missing: $MISSING_LIST — stdio MCP servers and/or nx-backed pc-* chunks will fail.")
  if [ "$IS_WORKTREE" = "true" ]; then
    WIN_WT=$(echo "$WORKTREE" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$WORKTREE")
    WIN_MAIN=$(echo "$MAIN_REPO" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$MAIN_REPO")
    WARNINGS+=("  Cause:  node_modules symlink is absent or broken in worktree.")
    WARNINGS+=("  Fix A:  from your terminal → cd \"$WIN_WT\" && node scripts/modules-pool/link.mjs  (links a content-addressable pool slot)")
    WARNINGS+=("  Fix B:  from your terminal → cd \"$WIN_WT\" && make modules-link WT=\"$WIN_WT\"  (directory symlinks require Windows Developer Mode)")
    WARNINGS+=("  After:  restart the Claude Code session — MCP servers only connect at session start.")
  else
    # Non-worktree sessions (cloud agents, Claude Code Remote, or a local
    # checkout run without the worktree checkbox) can hit this at the exact
    # moment this hook fires because `pnpm install` runs in parallel with
    # SessionStart hooks during container/session boot (LS-9154) — the
    # artifacts above may not exist yet even though they are about to. Do not
    # add a retry/poll loop here to paper over that: LS-4505 already tried
    # bounded polling for this same file and rejected it, because the race
    # window is unbounded (a cold-lockfile pnpm install can take minutes, not
    # seconds) — see docs/dev-process/session-startup.md § Why not just add
    # retries?.
    #
    # Distinguish "still installing" from "genuinely broken" with a real
    # signal instead of a timing guess: is a pnpm install actually running
    # right now? mcp-bootstrap.mjs (LS-8539) independently re-checks tsx on
    # every stdio MCP server launch attempt and runs `corepack pnpm install
    # --frozen-lockfile` itself when it's still missing, so a transient miss
    # here can self-heal with no action and no session restart — but only
    # while a repair process is actually in flight. If nothing is running,
    # the install did not just start; it stopped (LS-9577: most often
    # puppeteer's postinstall Chrome download dying in a network-sandboxed
    # container before node_modules/.modules.yaml gets written) and needs a
    # manual repair, not a wait.
    # Match only an actual install repair (mcp-bootstrap.mjs's `corepack pnpm
    # install ...`, cloud-setup.sh's `pnpm install ...`, link.mjs's pnpmInstall()
    # spawning `pnpm install ...` directly) — never `pnpm exec ...`, which runs
    # constantly for ordinary nx/tooling invocations and would otherwise make
    # "BROKEN" nearly unreachable via false-positive matches.
    if command -v pgrep >/dev/null 2>&1 && pgrep -f 'pnpm[^ ]* install( |$)' >/dev/null 2>&1; then
      WARNINGS+=("  Status: an install process is currently running — likely still finishing, not broken.")
      WARNINGS+=("  Self-heal: mcp-bootstrap.mjs re-checks these artifacts on every stdio MCP server launch attempt; no restart needed.")
      WARNINGS+=("  Next:   retry ToolSearch for a stdio server (e.g. 'select:worktree_ping') after it completes before concluding servers are broken.")
    else
      WARNINGS+=("  Status: BROKEN — no install process is currently running, so this is not transient.")
      WARNINGS+=("  Likely cause: a prior 'pnpm install --frozen-lockfile' died partway through (commonly puppeteer's postinstall Chrome download in a network-sandboxed container), leaving node_modules half-installed.")

      # Auto-repair (LS-8723): this is the fourth+ documented recurrence of
      # this exact class (LS-8113/LS-8363, both Done, hadn't stabilized) —
      # every prior fix only detected the condition and printed a manual "run
      # make install" instruction, leaving repair up to whichever agent
      # happened to read the warning. A decisive BROKEN verdict (not the
      # "still installing" branch above, which correctly leaves the race
      # alone per LS-4505) is exactly the case where running the fix
      # ourselves is safe: there is no install in flight to race against.
      # Bounded with `timeout` so a pathological hang can't stall session
      # start indefinitely; this script has no `set -e`, so a failed/timed
      # out repair falls through to the manual-fix message below rather than
      # aborting the hook.
      if command -v pnpm >/dev/null 2>&1; then
        WARNINGS+=("  Auto-repair: running 'pnpm install --frozen-lockfile' now (bounded to 5 min)...")
        if command -v timeout >/dev/null 2>&1; then
          timeout 300 env PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 pnpm install --frozen-lockfile >/dev/null 2>&1 || true
        else
          env PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 pnpm install --frozen-lockfile >/dev/null 2>&1 || true
        fi

        MISSING_AFTER_REPAIR=()
        [ ! -f "$TSX" ] && MISSING_AFTER_REPAIR+=("node_modules/.bin/tsx")
        [ ! -f "$MODULES_YAML" ] && MISSING_AFTER_REPAIR+=("node_modules/.modules.yaml")
        [ ! -f "$NX_BIN" ] && MISSING_AFTER_REPAIR+=("node_modules/.bin/nx")

        if [ ${#MISSING_AFTER_REPAIR[@]} -eq 0 ]; then
          WARNINGS+=("  Auto-repair: succeeded — tsx/.modules.yaml/nx all present now. No restart needed; retry the stdio ToolSearch.")
        else
          # A good install can still leave a stale nx project-graph cache
          # behind from before the repair (LS-8936) — clear it as a second,
          # cheap step before telling the agent to intervene manually.
          rm -rf "$WORKTREE/.nx/cache" "$WORKTREE/.nx/workspace-data" 2>/dev/null || true
          MISSING_LIST_AFTER=$(
            IFS=,
            echo "${MISSING_AFTER_REPAIR[*]}" | sed 's/,/, /g'
          )
          WARNINGS+=("  Auto-repair: still missing $MISSING_LIST_AFTER after install — cleared .nx/cache/.nx/workspace-data as a second attempt.")
          WARNINGS+=("  If still broken: run 'make install' manually in the project root, then retry.")
        fi
      else
        WARNINGS+=("  Fix:    pnpm not found (corepack not activated?) — run 'make install' manually once pnpm is available.")
      fi
    fi
  fi
fi

# --- 2. .mcp.json present ---------------------------------------------------
if [ ! -f "$WORKTREE/.mcp.json" ]; then
  WARNINGS+=("[MCP WARNING] .mcp.json not found at $WORKTREE — no MCP servers will be registered.")
  WARNINGS+=("  Check that CLAUDE_PROJECT_DIR is set to the correct worktree/repo path.")
fi

# --- 3. mcp-bootstrap.mjs present -------------------------------------------
if [ ! -f "$WORKTREE/.github/copilot/hooks/mcp-bootstrap.mjs" ]; then
  WARNINGS+=("[MCP WARNING] .github/copilot/hooks/mcp-bootstrap.mjs missing — MCP server launch will fail.")
  WARNINGS+=("  Restore it: git checkout main -- .github/copilot/hooks/mcp-bootstrap.mjs")
fi

# --- Emit warnings ----------------------------------------------------------
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│  MCP SERVER HEALTH CHECK — precondition failure(s) detected        │"
  echo "├─────────────────────────────────────────────────────────────────────┤"
  for w in "${WARNINGS[@]}"; do
    echo "  $w"
  done
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo "  See .agents/skills/mcp-first/references/diagnostics.md for the full diagnostic checklist."
  echo ""
fi

exit 0
