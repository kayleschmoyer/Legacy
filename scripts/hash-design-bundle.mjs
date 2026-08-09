#!/usr/bin/env node
// Compute a design bundle's `lastSyncedHash` (LS-9020).
//
// Every `/pull-design` run (and any manual design-source-fix re-sync) needs
// to compute `manifest.designs[].lastSyncedHash` per the algorithm in
// .agents/skills/design-sync/references/manifest-schema.md §Hashing. Before
// this script existed, agents hand-rolled a bash `find | sort` +
// `sha256sum` loop every time — error-prone to hand-transcribe (wrong sort
// collation, wrong tab/newline joining silently produces a wrong hash that
// the next sync then misclassifies as "changed" or "unchanged").
//
// Algorithm (see manifest-schema.md §Hashing for the canonical description):
//   1. Enumerate every file under <bundleDir>, excluding SYNC-REPORT.md.
//   2. Sort the file list by relative path, lexicographically, case-sensitive.
//   3. sha256(content) as lower-hex for each file.
//   4. Join "<relative-path>\t<sha256>\n" lines into one manifest string.
//   5. Final hash = "sha256-" + sha256(manifest-string) as lower-hex.
//
// Usage:
//   node scripts/hash-design-bundle.mjs docs/design/<id>          # human output
//   node scripts/hash-design-bundle.mjs docs/design/<id> --json   # JSON output for agents
//
// Make target: `make hash-design-bundle DIR=docs/design/<id>`.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** File(s) never included in the hash — written by the sync agent itself. */
const EXCLUDED_FILES = new Set(['SYNC-REPORT.md']);

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

/** Enumerate every file under `dir`, recursively, skipping EXCLUDED_FILES. */
function walkFiles(dir, base = dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, base, files);
    } else if (!EXCLUDED_FILES.has(entry.name)) {
      files.push(relative(base, full).split(sep).join('/'));
    }
  }
  return files;
}

/**
 * Compute the `sha256-<hex>` `lastSyncedHash` for a design bundle directory
 * per manifest-schema.md §Hashing. `bundleDir` must exist, be a directory,
 * and resolve inside this repo (callers pass `docs/design/<id>` or
 * `scratch/design-sync/<id>` — never an arbitrary filesystem path); throws
 * otherwise.
 */
export function hashBundle(bundleDir) {
  const resolvedDir = resolve(bundleDir);
  if (resolvedDir !== repoRoot && !resolvedDir.startsWith(repoRoot + sep)) {
    throw new Error(`bundleDir must resolve inside the repo: ${bundleDir}`);
  }
  if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    throw new Error(`Not a directory: ${bundleDir}`);
  }
  const relPaths = walkFiles(bundleDir).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const manifestString = relPaths
    .map((relPath) => {
      const content = readFileSync(join(bundleDir, relPath));
      return `${relPath}\t${sha256Hex(content)}\n`;
    })
    .join('');
  return {
    hash: `sha256-${sha256Hex(manifestString)}`,
    fileCount: relPaths.length,
    files: relPaths,
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const bundleDir = args.find((a) => !a.startsWith('--'));

  if (!bundleDir) {
    console.error(
      'Usage: node scripts/hash-design-bundle.mjs <bundleDir> [--json]',
    );
    process.exit(1);
  }

  let result;
  try {
    result = hashBundle(bundleDir);
  } catch (e) {
    console.error(`hash-design-bundle: ${e.message}`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.hash);
    console.error(`(${result.fileCount} file(s) hashed under ${bundleDir})`);
  }
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
