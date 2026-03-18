# Concurrent Agent Safety (Shared node_modules)

When multiple agents work in parallel, **all junctioned worktrees share the same physical
`node_modules` directory** in the main repo. This creates race conditions if any agent
mutates that directory.

## Rules for concurrent agents

1. **Never run `make clean`, `make install`, `make install-force`, or `pnpm install` in the
   main repo** (`D:\code\legacy-sports`) while worktrees are active. These mutate or destroy
   the shared `node_modules`, breaking every junctioned worktree mid-build/test.
2. **Only run install/clean inside your own worktree** — and only when it has independent
   (non-junctioned) `node_modules` (i.e., lockfiles diverged from main).
3. **All install operations are serialized** — `make install`, `make install-force`, `make install-node`,
   and `make wt-setup` all share a file lock (`.pnpm-install.lock`) in the main repo so concurrent
   agents don't race on `node_modules`. If another install is in progress, yours will wait (up to 5 min).
   **Never run raw `pnpm install`** — always use the Makefile targets.
4. **`make clean` and `make force-clean` are junction-safe** — they detect junctions and
   only unlink them (`cmd rmdir`) instead of recursively deleting the target contents.
5. **Runtime guards enforce these rules** — `make install` (via `pnpm-install-lock.ps1`) will
   **refuse to run** if `node_modules` is a junction, and `make clean` will **refuse to run** if
   other worktrees have junctions pointing to the shared `node_modules`. These guards exist
   because agents ignoring the instructions above caused cascading failures across all worktrees.

## What is safe in parallel

- Reading `node_modules` via junctions (builds, tests, lint) — multiple readers are fine.
- Running `make wt-setup` concurrently (serialized by lock).
- Running `pnpm install` in a worktree with independent `node_modules`.

## Never manually remove worktrees

Running `git worktree remove` or deleting a worktree directory (e.g., `Remove-Item -Recurse`)
**destroys the `node_modules` junction target** — the main repo's `node_modules`. This breaks
every other junctioned worktree and requires a full `make install` to recover. Always use
`twig worktree clean`, which safely unlinks junctions before removing the directory.

## When node_modules appears broken in a junctioned worktree

> This is the #1 agent failure mode. An agent sees "missing `.bin/`" or "module not found"
> and reflexively runs `make install` — which mutates the shared `node_modules` and breaks
> every other agent's worktree simultaneously, triggering a cascade of install attempts.

1. **Check if `node_modules` is a junction** (it almost always is):
   ```powershell
   (Get-Item node_modules -Force).Attributes -band [IO.FileAttributes]::ReparsePoint
   ```
2. **If it IS a junction** → the problem is in the main repo's `node_modules`, not yours.
   **Ask the user** to fix it. An agent must never autonomously run `make install` in the
   main repo while other worktrees are active.
3. **If the junction is missing** → re-run `make wt-setup WT=<this-worktree-path>` to
   recreate it. This is safe — it only creates a symlink, it doesn't mutate `node_modules`.
