# Concurrent Agent Safety (node_modules pool)

Each worktree's `node_modules` is a directory symlink into a content-addressable
**pool slot** keyed by the worktree's `pnpm-lock.yaml` hash
(`<main>\.modules-pool\<hash>\node_modules`). Slots are **immutable**: built once,
never mutated. This is what makes concurrent work safe — installing in one
worktree builds a _new_ slot and can never change the packages another worktree
is running, and `make install` can no longer `EPERM`-fail on a native binary
another worktree holds open. See [the modules-pool RFC](../../../../../docs/rfcs/modules-pool/README.md).

## Rules for concurrent agents

1. **Never run raw `pnpm install` / `pnpm add` straight through a worktree's
   `node_modules`.** It is a symlink into a _shared, immutable_ pool slot; writing
   through it would mutate a slot other worktrees are running. Always go through
   the resolver: `node scripts/modules-pool/link.mjs`, `make install`, or
   `make wt-setup`. `preinstall-guard.js` is the safety net — it detects a
   symlinked `node_modules` and exits 1.
2. **To add/remove/update dependencies in a worktree**, break the symlink first,
   then add, then re-link — adding a package changes the lockfile, so the resolver
   builds and links a _new_ slot:
   `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` →
   `pnpm add -w <pkg>` → `make install`. See [install-packages.md](../../../repo-tooling/references/install-packages.md).
3. **`make install` in the main repo is safe while worktrees are active.**
   Worktrees no longer symlink into main's `node_modules` — each points at its own
   pool slot — so a main-repo install (which links main's own slot) cannot break a
   worktree mid-build.
4. **`make clean` / `make force-clean` are symlink-safe** — they detect the
   `node_modules` symlink and only unlink it (`cmd rmdir`) instead of recursively
   deleting the slot it points at.

## What is safe in parallel

- Reading `node_modules` through the slot symlink (builds, tests, lint) — many
  readers of one immutable slot are fine.
- Running `make wt-setup` / `node scripts/modules-pool/link.mjs` concurrently in
  different worktrees — materialisation publishes via atomic rename, so concurrent
  builders of the same hash converge on one slot and the losers discard their temp
  copy.
- `pnpm add -w <pkg>` in a _detached_ worktree (symlink removed) as part of the
  documented package-add flow, followed by `make install`.

## Never manually remove worktrees

Running `git worktree remove` or deleting a worktree directory with a
recursive-delete tool can follow an NTFS _junction_ and destroy its target. The
resolver always creates directory _symlinks_ (never junctions) precisely so
recursive-delete tools unlink the link without recursing — but always use
`twig worktree clean`, which unlinks safely before removing the directory. Orphan
pool slots left behind by cleaned-up worktrees are reclaimed by `make modules-gc`.

## When node_modules appears broken in a worktree

Re-run the resolver from the worktree root — it is the one safe recovery for every
case (missing link, wrong target, junction, unhealthy slot):

```powershell
node scripts/modules-pool/link.mjs
```

If a healthy slot already exists for the lockfile it re-links in milliseconds;
otherwise it materialises a fresh slot (`pnpm install --frozen-lockfile` → atomic
publish) and links it. This never touches any other worktree's slot.

## Runtime Guards

| Guard                           | File                      | Trigger                                | What it blocks                                             |
| ------------------------------- | ------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Package manager enforcement** | `preinstall-guard.js`     | Any `npm install` / `yarn install`     | Non-pnpm package managers (checks `npm_config_user_agent`) |
| **Symlink mutation (worktree)** | `preinstall-guard.js`     | `pnpm install` in a symlinked worktree | Detects symlink via `fs.readlinkSync()`, exits 1           |
| **Clean guard**                 | `Makefile` (`make clean`) | `make clean` in worktree or main repo  | Blocks if `node_modules` is a symlink (self or siblings)   |
