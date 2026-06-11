# 0007. Claude Code worktree checkbox as default agent surface

Date: 2026-03-15

## Status

Accepted

## Context

AI coding agents need an isolated working environment so that:

1. Changes on one ticket do not interfere with another ticket's uncommitted state.
2. The `node_modules` setup, which is heavyweight (thousands of files), is shared
   efficiently across concurrent sessions.
3. The agent's branch is visible in the Claude Code launcher UI for the human to
   track and review.

Several approaches were considered:

- **Work in the main repo root** — no isolation; concurrent agents on different
  tickets stomp on each other's uncommitted files.
- **Sibling worktrees (`make worktree TICKET=####`)** — `git worktree add` creates a
  sibling directory alongside the main repo. Works but requires manual setup (`twig`
  commands), the branch name must be passed explicitly, and the agent session has no
  built-in UI affordance linking it to the worktree.
- **Containers / dev containers** — full isolation but container startup is slow,
  the `node_modules` pool cannot be shared across containers without a volume mount,
  and Claude Code's file tooling does not see inside containers.
- **Claude Code native ephemeral worktrees (launcher checkbox)** — Claude Code's
  launcher creates a worktree at `.claude/worktrees/<session-name>/`, sets the
  working directory to that path, and tracks the branch name in the session UI.
  `node_modules` is a symlink into the content-addressable pool so no reinstall
  is needed.

The sibling worktree approach was the prior default. It was replaced when Claude Code
added native worktree support (the launcher checkbox), which handled the branch
creation and UI linkage automatically.

## Decision

We will use **Claude Code's native ephemeral worktree** (launcher checkbox) as the
default surface for all agent ticket work.

- Every ticket starts in `.claude/worktrees/<session-name>/` with a pre-linked
  `node_modules` symlink.
- The session branch name is set by Claude Code at session start and must not be
  renamed mid-session (Claude Code caches it; renaming breaks PR detection).
- Jira linking happens via the PR title and commit messages containing `LS-####` —
  not via branch name convention — so the auto-generated branch name is acceptable.
- Sibling worktrees (`make_worktree_create`) remain supported for parallel work that
  needs to outlive a single Claude Code session or run on a different machine.
- The modules pool (`<main>/.modules-pool/<sha256(pnpm-lock.yaml)>/node_modules`)
  is content-addressed so multiple concurrent worktrees share the same
  `node_modules` snapshot without conflict. Repair via
  `node scripts/modules-pool/link.mjs`.

## Consequences

### Easier

- Starting a new ticket requires only checking the launcher checkbox; no `git worktree
add` command, no branch naming, no manual `node_modules` link step.
- Concurrent agents on different tickets cannot accidentally modify each other's
  working tree.
- The session title in the Claude Code UI maps 1:1 to the worktree branch, making
  it easy to find which session owns which branch.
- The modules pool eliminates repeated `pnpm install` calls; cold-start for a new
  worktree is seconds, not minutes.

### Harder

- The auto-generated branch name (`claude/session-name`) is not human-readable as
  a Jira key. Jira linking relies entirely on `LS-####` appearing in commit messages
  or the PR title — forgetting to include the key breaks automation.
- Ephemeral worktrees live inside `.claude/worktrees/` which is not standard; some
  tooling (linters, IDEs) may need to be told to include or exclude this path.
- `pnpm exec nx reset` destroys the pooled symlink (LS-5242); always use
  `make clean-cache` or `make reset` instead, which re-links automatically.
- Windows Developer Mode must be enabled for directory symlinks to work; without it,
  `node scripts/modules-pool/link.mjs` falls back to a junction, which can behave
  differently from a symlink for some tooling.

### Now constrained

- **Do not rename the session branch.** Claude Code caches the initial branch name;
  renaming it mid-session causes PR creation to target the wrong branch.
- **Use `twig worktree clean` to remove worktrees** — never `git worktree remove`
  or manual directory deletion, which destroys the `node_modules` symlink and can
  leave the pool in an inconsistent state.
- **Never use `New-Item -ItemType SymbolicLink/Junction` or `mklink /J` to recreate
  `node_modules`** — only `node scripts/modules-pool/link.mjs` handles path
  consistency and the `modules.yaml` manifest.
