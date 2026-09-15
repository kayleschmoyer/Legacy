#!/usr/bin/env node
/**
 * Case-only path collision check (LS-10207).
 *
 * Fails when two git-tracked paths (files or directories) differ only by
 * letter case, e.g. `Foo.ts` + `foo.ts` or the directories `Foo/` + `foo/`.
 * It also catches the subtler module-resolution variant: two files whose
 * extensionless import specifiers differ only by case, e.g.
 * `DraftPickInspector.tsx` + `draftPickInspector.ts`. On a case-insensitive
 * filesystem TypeScript/Node resolve both `./DraftPickInspector` and
 * `./draftPickInspector` to whichever extension they try first.
 *
 * Why: Linux CI is case-sensitive, so these collisions keep every PR gate
 * green while breaking typecheck/lint/test/build for Windows and macOS
 * developers. LS-10163 shipped `DraftPickInspector.tsx` alongside
 * `draftPickInspector.ts` and every local Windows `pc-*` chunk went red.
 *
 * Usage:
 *   node scripts/check-case-collisions.mjs           # human output
 *   node scripts/check-case-collisions.mjs --json    # JSON output for agents
 *
 * Exit code 0 if no collisions, 1 if collisions found.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** Extensions module resolution tries implicitly (stripped for the specifier key). */
const RESOLVABLE_EXTENSIONS = /\.(d\.ts|tsx?|jsx?|mjs|cjs|json)$/;

/**
 * Strips a trailing resolvable extension (keeping `.spec`/`.test` infixes),
 * so `a/Foo.tsx` and `a/foo.ts` share the specifier `a/foo`.
 */
export function specifierOf(path) {
  return path.replace(RESOLVABLE_EXTENSIONS, '');
}

/**
 * Returns collision groups: each group is the sorted list of distinct
 * spellings (paths, directory prefixes, or extensionless specifiers) that
 * fold to the same lowercase key.
 */
export function findCaseCollisions(paths) {
  /** @type {Map<string, Set<string>>} */
  const byPath = new Map();
  /** @type {Map<string, Set<string>>} */
  const bySpecifier = new Map();
  const add = (map, spelling) => {
    const key = spelling.toLowerCase();
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(spelling);
  };

  for (const path of paths) {
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      add(byPath, `${segments.slice(0, i).join('/')}/`);
    }
    add(byPath, path);
    const spec = specifierOf(path);
    if (spec !== path) add(bySpecifier, spec);
  }

  const groups = [];
  const pathSpecifierKeys = new Set();
  for (const spellings of byPath.values()) {
    if (spellings.size > 1) {
      const group = [...spellings].sort();
      groups.push(group);
      pathSpecifierKeys.add(specifierOf(group[0]).toLowerCase());
    }
  }
  // A specifier collision already explained by an exact-path collision
  // (`Foo.ts` + `foo.ts`) is the same defect — report it once.
  for (const [key, spellings] of bySpecifier) {
    if (spellings.size > 1 && !pathSpecifierKeys.has(key))
      groups.push([...spellings].sort());
  }
  // A colliding directory makes every path beneath it collide too; report
  // only the shallowest spelling of each collision.
  const dirGroups = groups.filter((g) => g[0].endsWith('/'));
  return groups
    .filter(
      (g) =>
        !dirGroups.some(
          (d) =>
            d !== g &&
            g.some((p) =>
              d.some((dir) => p.toLowerCase().startsWith(dir.toLowerCase())),
            ),
        ),
    )
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function main() {
  const json = process.argv.includes('--json');
  const collisions = findCaseCollisions(trackedPaths());
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: collisions.length === 0, collisions }, null, 2)}\n`,
    );
  } else if (collisions.length === 0) {
    process.stdout.write('No case-only path collisions.\n');
  } else {
    process.stderr.write(
      `Found ${collisions.length} case-only path collision(s). These break checkouts on case-insensitive filesystems (Windows/macOS); rename one side:\n`,
    );
    for (const group of collisions)
      process.stderr.write(`  - ${group.join('  <->  ')}\n`);
  }
  process.exit(collisions.length === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
