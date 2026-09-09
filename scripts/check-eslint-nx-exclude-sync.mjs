#!/usr/bin/env node
/**
 * Drift check between eslint.config.mjs's tools/ ignore list and nx.json's
 * @nx/eslint/plugin exclude array (LS-9322).
 *
 * eslint.config.mjs's basePath-pinned, files-less global ignore block (the
 * one holding e.g. 'tools/mcp/aws-server/**') is the source of truth for
 * which tools/mcp/* and tools/* projects are still excluded from ESLint 9
 * during the LS-8747 migration cleanup. nx.json's @nx/eslint/plugin.exclude
 * array is a second, parallel exclude list that controls whether Nx even
 * infers a `lint` target for those same projects.
 *
 * The two lists must name exactly the same tools/ projects. When a project
 * is removed from eslint.config.mjs's ignores (because it's lint-clean) but
 * left in nx.json's exclude array, `nx run <project>:lint` silently has no
 * target — so a PR's own "nx run <project>:lint passes" AC can silently
 * self-satisfy as "no such target" without the project ever actually being
 * linted. This happened three times in a row across the LS-8747 slice
 * (LS-9297/9298/9299) before being caught by LS-9296/LS-9322.
 *
 * Usage:
 *   node scripts/check-eslint-nx-exclude-sync.mjs
 *
 * Exit code 0 if the two lists match, 1 if they've drifted apart.
 */

import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/**
 * The tools/ globs named by eslint.config.mjs's global ignore block(s) —
 * config objects with an `ignores` array and no `files`/`rules` keys, which
 * ESLint 9 flat config treats as unconditional (not rule-scoped) ignores.
 * Excludes rule-scoped `ignores` (e.g. the VITE_* restriction's exemption
 * for tools/vite-configs/**), which apply to one rule block only.
 */
async function eslintIgnoredToolsProjects() {
  const configUrl = pathToFileURL(join(repoRoot, 'eslint.config.mjs')).href;
  const { default: config } = await import(configUrl);
  const ignored = new Set();
  for (const entry of config) {
    if (!Array.isArray(entry.ignores)) continue;
    if (entry.files || entry.rules) continue; // rule-scoped, not a global ignore
    for (const pattern of entry.ignores) {
      if (pattern.startsWith('tools/')) ignored.add(pattern);
    }
  }
  return ignored;
}

/** The tools/ globs named by nx.json's @nx/eslint/plugin.exclude array. */
function nxExcludedToolsProjects() {
  const nxConfig = JSON.parse(readFileSync(join(repoRoot, 'nx.json'), 'utf8'));
  const eslintPlugin = (nxConfig.plugins ?? []).find(
    (p) => p.plugin === '@nx/eslint/plugin',
  );
  const exclude = eslintPlugin?.exclude ?? [];
  return new Set(exclude.filter((pattern) => pattern.startsWith('tools/')));
}

async function main() {
  const eslintIgnored = await eslintIgnoredToolsProjects();
  const nxExcluded = nxExcludedToolsProjects();

  const staleInNx = [...nxExcluded].filter((p) => !eslintIgnored.has(p)).sort();
  const missingFromNx = [...eslintIgnored]
    .filter((p) => !nxExcluded.has(p))
    .sort();

  if (staleInNx.length === 0 && missingFromNx.length === 0) {
    console.log(
      `✓ nx.json's @nx/eslint/plugin.exclude matches eslint.config.mjs's tools/ ignores (${nxExcluded.size} project(s))`,
    );
    process.exit(0);
  }

  if (staleInNx.length > 0) {
    console.log(
      `Found ${staleInNx.length} stale entr${staleInNx.length === 1 ? 'y' : 'ies'} in nx.json's @nx/eslint/plugin.exclude (already removed from eslint.config.mjs's ignores):\n`,
    );
    for (const p of staleInNx) console.log(`  - ${p}`);
    console.log(
      '\nThese projects lint clean but nx.json still filters them out of `nx run <project>:lint` target inference.',
    );
    console.log(
      "Remove them from nx.json's @nx/eslint/plugin.exclude array.\n",
    );
  }

  if (missingFromNx.length > 0) {
    console.log(
      `Found ${missingFromNx.length} entr${missingFromNx.length === 1 ? 'y' : 'ies'} ignored by eslint.config.mjs but missing from nx.json's @nx/eslint/plugin.exclude:\n`,
    );
    for (const p of missingFromNx) console.log(`  - ${p}`);
    console.log(
      "\nAdd them to nx.json's @nx/eslint/plugin.exclude array so `nx run <project>:lint` doesn't attempt to lint a project ESLint itself ignores.\n",
    );
  }

  process.exit(1);
}

main();
