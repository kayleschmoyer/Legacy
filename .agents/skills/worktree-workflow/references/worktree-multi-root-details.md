# Multi-Root Workspace Details

AI agents can only search files inside VS Code workspace folders. To give
multiple agents search access to their assigned worktrees from a single
VS Code window, generate a multi-root workspace file:

```powershell
# In the main repo (D:\code\legacy-sports):

# Include ONLY the worktrees your agents are actively using:
make sync-worktrees TICKETS=501,493,498

# Or include ALL active worktrees (use sparingly — see TS note below):
make sync-worktrees

code legacy-sports.code-workspace
```

This opens **one** VS Code window with the main repo plus selected worktrees.
Agents' semantic search, file search, and grep tools now cover all included
folders.

**Incremental updates** — add or remove individual worktrees without regenerating:

```powershell
make sync-worktrees-add TICKET=507       # add one worktree
make sync-worktrees-remove TICKET=493    # remove one worktree
```

**Auto-add on create** — `make worktree` creates the worktree AND auto-adds it:

```powershell
make worktree TICKET=507 DESC=fix-scoring
```

**TypeScript tradeoff:** Each added worktree is a full monorepo copy with
~99 `tsconfig.json` files. The TS language server creates projects for each
one, consuming memory. The generated workspace bumps TS memory to 12 GB and
disables proactive diagnostics to mitigate this, but **limit to 3-4 worktrees**
for best performance. If IntelliSense becomes slow, reduce the included set.

**Fallback — per-session file access:**
If you don't want a multi-root workspace, the agent can still edit worktree files by
referencing absolute paths. VS Code will prompt: **"Allow reading/editing external
files?"** — click **Allow** to grant access for the session. However, search/discovery
tools will only cover the main repo.
