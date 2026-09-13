#!/usr/bin/env node
/**
 * Guard: every project's eslint.config.mjs must anchor its
 * `languageOptions.parserOptions.project` globs to that project's own
 * directory (LS-10063, follow-up to LS-8700 / LS-10062).
 *
 * Why this guard exists
 * ---------------------
 * The root eslint.config.mjs pins `parserOptions.tsconfigRootDir` to the
 * workspace root, and every project config spreads that root config in as
 * its base. So a project-level glob written the way Nx's own project
 * generator emits it —
 *
 *     project: ['tsconfig.*?.json']       // unanchored
 *
 * — does not resolve against the project's directory. It resolves against
 * the workspace root, silently handing the type-aware rules the WRONG
 * TypeScript program. Nothing errors: lint still runs, still reports
 * "passing", just against the wrong compilerOptions. The correct form
 * prefixes the project's own path:
 *
 *     project: ['lib/scoring/tsconfig.*?.json']   // anchored
 *
 * LS-8700 and LS-10062 fixed every existing project by hand. Neither could
 * fix the source: new projects are scaffolded by `@nx/*` generators that
 * live in node_modules and are not patchable here, so the unanchored
 * template keeps coming back every time someone runs `nx g`. This check is
 * the durable backstop — it fails CI the first time an unanchored project
 * config lands, instead of letting it lint green against the wrong program
 * indefinitely.
 *
 * What it checks
 * --------------
 * Each project config is imported and resolved the way ESLint flat config
 * resolves it: later entries win. The LAST entry that declares
 * `parserOptions.project` and applies to TypeScript files is the one that
 * actually governs the project's `.ts`/`.tsx` files, so that is the entry
 * whose globs must be anchored. Two failure modes are reported:
 *
 *   - the winning declaration has a glob not prefixed with `<project>/`
 *     (the unanchored-template regression this guard exists for), and
 *   - the project declares no `parserOptions.project` of its own at all,
 *     in which case it silently inherits the root config's
 *     `./tsconfig.base.json` — equally wrong, and equally silent.
 *
 * Usage:
 *   node scripts/check-eslint-tsconfig-anchored.mjs
 *
 * Exit code 0 if every project config is anchored, 1 otherwise.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/**
 * Workspace roots that hold projects. Mirrors the `apps/`, `lambdas/`,
 * `lib/`, `tools/` layout documented in AGENTS.md § Architecture.
 */
export const PROJECT_ROOTS = ['apps', 'lambdas', 'lib', 'tools'];

export const CONFIG_FILENAME = 'eslint.config.mjs';

/**
 * Directories never worth descending into when hunting for project
 * configs — either not ours, or generated.
 */
export const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
  '.nx-cache',
  '.tamagui',
]);

/**
 * Every `<dir>/eslint.config.mjs` under the project roots, as repo-relative
 * POSIX directory paths. The workspace-root config is deliberately excluded:
 * it is the base every project inherits, and its `./tsconfig.base.json` is
 * correct *for the root*.
 */
export function findProjectConfigDirs(root = repoRoot, roots = PROJECT_ROOTS) {
  const found = [];

  function walk(absDir, relDir) {
    // Deliberately not wrapped in try/catch: a directory this walk cannot
    // read is an environment fault, and swallowing it would silently skip a
    // project and report a false green — the exact failure mode this guard
    // exists to prevent.
    const entries = readdirSync(absDir, { withFileTypes: true });

    if (entries.some((e) => e.isFile() && e.name === CONFIG_FILENAME)) {
      found.push(relDir);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(join(absDir, entry.name), `${relDir}/${entry.name}`);
    }
  }

  for (const projectRoot of roots) {
    const absRoot = join(root, projectRoot);
    if (existsSync(absRoot)) walk(absRoot, projectRoot);
  }

  return found.sort();
}

/**
 * Whether a flat-config entry's `files` patterns cover TypeScript sources.
 * An entry with no `files` key applies to everything, TypeScript included.
 */
export function appliesToTypeScript(entry) {
  if (!entry.files) return true;
  const patterns = (
    Array.isArray(entry.files) ? entry.files : [entry.files]
  ).flat();
  return patterns.some(
    (pattern) =>
      typeof pattern === 'string' &&
      // '**/*.ts', '**/*.tsx', and the brace form '**/*.{ts,tsx}'.
      (pattern.endsWith('.ts') ||
        pattern.endsWith('.tsx') ||
        pattern.includes('{ts')),
  );
}

/** Normalize `parserOptions.project` to an array of glob strings. */
export function projectGlobs(entry) {
  const project = entry?.languageOptions?.parserOptions?.project;
  if (typeof project === 'string') return [project];
  if (Array.isArray(project))
    return project.filter((p) => typeof p === 'string');
  return null;
}

/**
 * The `parserOptions.project` globs that actually govern a project's
 * TypeScript files: ESLint flat config merges matching entries in order and
 * the last writer wins, so the last TypeScript-applicable declaration is the
 * effective one. Returns null when the project declares none.
 */
export function effectiveProjectGlobs(config) {
  let winner = null;
  for (const entry of config) {
    if (!entry || typeof entry !== 'object') continue;
    const globs = projectGlobs(entry);
    if (!globs || globs.length === 0) continue;
    if (!appliesToTypeScript(entry)) continue;
    winner = globs;
  }
  return winner;
}

/**
 * A glob is anchored when it is confined to the project's own directory.
 * `lib/scoring/tsconfig.*?.json` is anchored for `lib/scoring`;
 * `tsconfig.*?.json` and `./tsconfig.base.json` are not.
 */
export function isAnchored(glob, projectDir) {
  return glob.startsWith(`${projectDir}/`);
}

async function main() {
  const projectDirs = findProjectConfigDirs();
  const failures = [];
  let checked = 0;

  for (const projectDir of projectDirs) {
    const configPath = join(repoRoot, projectDir, CONFIG_FILENAME);

    let config;
    try {
      ({ default: config } = await import(pathToFileURL(configPath).href));
    } catch (error) {
      failures.push({
        projectDir,
        kind: 'unloadable',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!Array.isArray(config)) {
      failures.push({
        projectDir,
        kind: 'unloadable',
        detail: `${CONFIG_FILENAME} default export is not a flat-config array`,
      });
      continue;
    }

    checked++;

    const globs = effectiveProjectGlobs(config);

    if (globs === null) {
      failures.push({ projectDir, kind: 'missing' });
      continue;
    }

    const unanchored = globs.filter((glob) => !isAnchored(glob, projectDir));
    if (unanchored.length > 0) {
      failures.push({ projectDir, kind: 'unanchored', globs, unanchored });
    }
  }

  if (failures.length === 0) {
    console.log(
      `✓ all ${checked} project eslint.config.mjs file(s) anchor parserOptions.project to their own directory`,
    );
    process.exit(0);
  }

  console.log(
    `Found ${failures.length} project eslint.config.mjs file(s) whose parserOptions.project is not anchored to the project's own directory:\n`,
  );

  for (const failure of failures) {
    const { projectDir, kind } = failure;
    if (kind === 'unloadable') {
      console.log(`  ${projectDir}/${CONFIG_FILENAME} — could not be loaded`);
      console.log(`    ${failure.detail}`);
      continue;
    }
    if (kind === 'missing') {
      console.log(
        `  ${projectDir}/${CONFIG_FILENAME} — declares no languageOptions.parserOptions.project`,
      );
      console.log(
        `    It therefore inherits the root config's ['./tsconfig.base.json'], type-checking this`,
      );
      console.log(
        `    project against the workspace-root program instead of its own.`,
      );
      console.log(`    Add:  project: ['${projectDir}/tsconfig.*?.json']`);
      continue;
    }
    console.log(
      `  ${projectDir}/${CONFIG_FILENAME} — unanchored glob(s): ${failure.unanchored
        .map((g) => `'${g}'`)
        .join(', ')}`,
    );
    console.log(
      `    effective project: [${failure.globs.map((g) => `'${g}'`).join(', ')}]`,
    );
    console.log(
      `    Prefix each glob with the project's own path, e.g. '${projectDir}/tsconfig.*?.json'.`,
    );
  }

  console.log(
    `\nparserOptions.tsconfigRootDir is pinned to the workspace root, so an unanchored glob`,
  );
  console.log(
    `resolves against the root tsconfigs rather than the project's own — the type-aware rules`,
  );
  console.log(
    `then run against the wrong TypeScript program and lint passes without checking anything`,
  );
  console.log(`meaningful. See LS-8700 / LS-10062 / LS-10063.\n`);

  process.exit(1);
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
