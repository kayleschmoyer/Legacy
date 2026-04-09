# Design Rationale: One Worktree per Branch

This project uses **one worktree per branch** rather than a pool of static, reusable worktrees. Here's why:

**Why one-per-branch wins for async workflows:**

- **Instant context switching** — Multiple tickets sit in-flight simultaneously. Switch by changing directories, not by stashing, checking out, and reinstalling.
- **Full isolation** — No risk of stale build artifacts, cached Nx state, or leftover generated files bleeding between unrelated tickets.
- **Stacked branches are trivial** — Each dependent branch lives in its own tree rooted on its parent. No manual branch juggling.
- **Clean teardown** — `twig worktree clean` removes worktrees whose branches have been merged or deleted.

**Why reusable static worktrees would hurt:**

- Every branch swap requires a full clean: `git checkout`, potentially `pnpm install` (if the lockfile diverged), Nx cache invalidation, `.env` re-copy, and generated file rebuild — most of `make wt-setup` anyway.
- You lose the ability to park 3-4 tickets mid-work and resume any of them instantly.
- Leftover Nx cache from a previous branch can cause subtle build bugs that are hard to diagnose.

**Disk cost is minimal:**

- `make wt-setup` junctions `node_modules` to the main repo when lockfiles match, so worktrees share the ~1.8 GB `node_modules` with zero extra disk.
- pnpm's content-addressable store deduplicates packages globally — multiple worktrees don't multiply download or storage costs.
- The only per-worktree disk cost is the source files themselves (~50 MB), which is negligible.
