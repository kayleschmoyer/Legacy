#!/usr/bin/env bash
# Regenerate pnpm-lock.yaml from an isolated copy of the workspace manifests,
# never touching the worktree's live (possibly symlinked) node_modules pool.
#
# Problem this solves (LS-9837): in a worktree, node_modules is a symlink into
# a shared content-addressable pool slot (scripts/modules-pool/link.mjs). A
# real `pnpm install` there is rightly blocked by guard-risky-tools.mjs's
# pnpm-install-symlink rule — writing through that symlink would corrupt the
# slot every other worktree on the machine shares. But neither existing path
# regenerates the lockfile: `make install` only links pool slots on Windows,
# and `pnpm install --frozen-lockfile` refuses to change it. So after editing
# a package.json there was no sanctioned way to produce an updated lockfile
# from inside a worktree.
#
# This runs the verified workaround: copy only the files pnpm needs to
# resolve dependencies (manifests + workspace config + patches) into a
# scratch temp directory that has no node_modules of its own, run
# `pnpm install --lockfile-only` there, then copy the resulting
# pnpm-lock.yaml back. Nothing under the temp directory is ever symlinked to
# the shared pool, so the pool is provably untouched.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ls-lockfile.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

echo "[lockfile] staging manifests in $STAGE"

# Root-level files pnpm needs to resolve the workspace.
for f in package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml .pnpmfile.cjs; do
  [ -f "$f" ] && cp "$f" "$STAGE/"
done
[ -d patches ] && cp -R patches "$STAGE/"

# Every workspace package's package.json, at the same relative path — pnpm
# resolves `workspace:` ranges and the patchedDependencies/overrides tables
# by that path, so the copy must preserve it.
while IFS= read -r pkg; do
  dest="$STAGE/$(dirname "$pkg")"
  mkdir -p "$dest"
  cp "$pkg" "$dest/"
done < <(git ls-files -- 'apps/*/package.json' 'lib/*/package.json' 'lambdas/*/package.json' 'tools/*/package.json')

echo "[lockfile] running pnpm install --lockfile-only in isolation (no node_modules, no shared pool involved)"
(cd "$STAGE" && pnpm install --lockfile-only --ignore-scripts)

cp "$STAGE/pnpm-lock.yaml" "$ROOT/pnpm-lock.yaml"
echo "[lockfile] pnpm-lock.yaml regenerated at $ROOT/pnpm-lock.yaml"
