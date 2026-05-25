#!/usr/bin/env node
/**
 * Surface-aware integration spec selector (integration-safety system, Tier 2).
 *
 * The live-backend integration suite is expensive, so we don't run all 22 specs
 * on every PR. This selector maps a PR's changed files to the minimal set of
 * integration specs that exercise the affected surfaces, using the manifest at
 * apps/web-e2e/src/integration/integration-surface-map.json.
 *
 * Selection logic (union):
 *   1. runAll  — if any changed file matches `runAllWhenChanged` (backend schema,
 *                shared integration helpers/fixtures/config), every spec is
 *                selected. These changes can break any flow.
 *   2. edited  — a changed file that IS an integration spec selects itself.
 *   3. surface — a spec is selected if any changed file matches one of its
 *                surface globs.
 *
 * Over-selection is safe (a few extra minutes); under-selection is the risk we
 * design against, so the manifest globs lean broad.
 *
 * Usage:
 *   node select-specs.mjs --manifest <path> --changed-file <f> [--changed-file <f> ...]
 *   node select-specs.mjs --manifest <path> --changed-from-stdin   # newline-delimited
 *   Output (default): newline-delimited selected spec paths.
 *   With --json: { runAll, reason, specs: [...] }.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Convert a simple glob (supporting `**` and `*`) to an anchored RegExp. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'; // ** — cross-segment
        i++;
        if (glob[i + 1] === '/') i++; // collapse `**/`
      } else {
        re += '[^/]*'; // * — within a segment
      }
    } else if ('\\^$+?.()|[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchesAny(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

/**
 * @param {{ changedFiles: string[], manifest: { runAllWhenChanged?: string[], specs: Record<string, string[]> } }} args
 * @returns {{ runAll: boolean, reason: string, specs: string[] }}
 */
export function selectSpecs({ changedFiles, manifest }) {
  const allSpecs = Object.keys(manifest.specs).sort();
  const runAllGlobs = manifest.runAllWhenChanged ?? [];

  const runAllHit = changedFiles.find((f) => matchesAny(f, runAllGlobs));
  if (runAllHit) {
    return {
      runAll: true,
      reason: `changed file '${runAllHit}' matches a runAllWhenChanged pattern`,
      specs: allSpecs,
    };
  }

  const selected = new Set();
  for (const f of changedFiles) {
    if (manifest.specs[f]) selected.add(f); // edited spec selects itself
  }
  for (const [spec, surfaces] of Object.entries(manifest.specs)) {
    if (changedFiles.some((f) => matchesAny(f, surfaces))) selected.add(spec);
  }

  return {
    runAll: false,
    reason: selected.size
      ? 'surface map matched changed files'
      : 'no integration surfaces affected',
    specs: [...selected].sort(),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    manifest: null,
    changedFiles: [],
    fromStdin: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--changed-file') args.changedFiles.push(argv[++i]);
    else if (a === '--changed-from-stdin') args.fromStdin = true;
    else if (a === '--json') args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error('error: --manifest <path> is required');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  let changedFiles = args.changedFiles;
  if (args.fromStdin) {
    const stdin = readFileSync(0, 'utf8');
    changedFiles = changedFiles.concat(
      stdin
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }
  const result = selectSpecs({ changedFiles, manifest });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(
      result.specs.join('\n') + (result.specs.length ? '\n' : ''),
    );
  }
}

// pathToFileURL handles relative argv[1] and URL-encoding, unlike a raw
// `file://${process.argv[1]}` comparison.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
