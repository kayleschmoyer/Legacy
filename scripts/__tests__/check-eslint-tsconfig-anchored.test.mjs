/**
 * Tests for scripts/check-eslint-tsconfig-anchored.mjs (LS-10063).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-eslint-tsconfig-anchored.test.mjs
 *
 * The check exists because parserOptions.tsconfigRootDir is pinned to the
 * workspace root, so the bare `tsconfig.*?.json` glob that Nx's project
 * generator emits resolves against the root tsconfigs rather than the
 * project's own — type-aware rules then lint against the wrong TypeScript
 * program and still report green (LS-8700, LS-10062).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  appliesToTypeScript,
  projectGlobs,
  effectiveProjectGlobs,
  isAnchored,
  findProjectConfigDirs,
  PROJECT_ROOTS,
  CONFIG_FILENAME,
} from '../check-eslint-tsconfig-anchored.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A flat-config entry declaring `project` for the given files. */
const entryWithProject = (project, files) => ({
  ...(files ? { files } : {}),
  languageOptions: { parserOptions: { project } },
});

// --- isAnchored ---

test('isAnchored accepts a glob prefixed with the project directory', () => {
  assert.equal(isAnchored('lib/scoring/tsconfig.*?.json', 'lib/scoring'), true);
  assert.equal(isAnchored('lib/scoring/tsconfig.json', 'lib/scoring'), true);
});

test('isAnchored rejects the bare generator template and the root base config', () => {
  assert.equal(isAnchored('tsconfig.*?.json', 'lib/scoring'), false);
  assert.equal(isAnchored('./tsconfig.base.json', 'lib/scoring'), false);
});

test('isAnchored rejects a sibling project that merely shares a prefix', () => {
  // 'lib/scoring-utils/...' must not count as anchored for 'lib/scoring'.
  assert.equal(
    isAnchored('lib/scoring-utils/tsconfig.json', 'lib/scoring'),
    false,
  );
});

// --- projectGlobs ---

test('projectGlobs normalizes a string, an array, and a missing value', () => {
  assert.deepEqual(projectGlobs(entryWithProject('lib/a/tsconfig.json')), [
    'lib/a/tsconfig.json',
  ]);
  assert.deepEqual(
    projectGlobs(
      entryWithProject(['lib/a/tsconfig.json', 'lib/a/tsconfig.spec.json']),
    ),
    ['lib/a/tsconfig.json', 'lib/a/tsconfig.spec.json'],
  );
  assert.equal(projectGlobs({ rules: {} }), null);
  assert.equal(projectGlobs({ languageOptions: {} }), null);
});

// --- appliesToTypeScript ---

test('appliesToTypeScript covers TS file patterns and files-less entries', () => {
  assert.equal(appliesToTypeScript({ files: ['**/*.ts', '**/*.tsx'] }), true);
  assert.equal(appliesToTypeScript({ files: ['**/e2e/**/*.ts'] }), true);
  assert.equal(appliesToTypeScript({ files: [['**/*.ts']] }), true);
  // No `files` key — a flat-config entry that applies to everything.
  assert.equal(appliesToTypeScript({ rules: {} }), true);
});

test('appliesToTypeScript ignores JavaScript-only entries', () => {
  assert.equal(appliesToTypeScript({ files: ['**/*.js', '**/*.jsx'] }), false);
});

test('appliesToTypeScript handles the brace form and a non-array files value', () => {
  assert.equal(appliesToTypeScript({ files: ['**/*.{ts,tsx}'] }), true);
  assert.equal(appliesToTypeScript({ files: '**/*.ts' }), true);
  assert.equal(appliesToTypeScript({ files: '**/*.js' }), false);
});

// --- effectiveProjectGlobs ---

test('effectiveProjectGlobs returns null when no entry declares project', () => {
  assert.equal(
    effectiveProjectGlobs([{ rules: {} }, { ignores: ['dist'] }]),
    null,
  );
});

test('effectiveProjectGlobs takes the last declaration — flat config is last-wins', () => {
  // This is the real shape: the inherited root/base entry comes first, the
  // project's own anchored override comes after it and must win.
  const config = [
    entryWithProject(['./tsconfig.base.json'], ['**/*.ts', '**/*.tsx']),
    entryWithProject(['lib/scoring/tsconfig.*?.json'], ['**/*.ts', '**/*.tsx']),
    { files: ['**/*.ts'], rules: {} },
    { ignores: ['dist'] },
  ];
  assert.deepEqual(effectiveProjectGlobs(config), [
    'lib/scoring/tsconfig.*?.json',
  ]);
});

test('effectiveProjectGlobs surfaces an inherited unanchored base when the project adds no override', () => {
  const config = [
    entryWithProject(['tsconfig.*?.json'], ['**/*.ts', '**/*.tsx']),
  ];
  const globs = effectiveProjectGlobs(config);
  assert.deepEqual(globs, ['tsconfig.*?.json']);
  assert.equal(isAnchored(globs[0], 'lib/newly-generated'), false);
});

test('effectiveProjectGlobs skips JS-only and malformed entries', () => {
  const config = [
    entryWithProject(['lib/a/tsconfig.json'], ['**/*.ts']),
    entryWithProject(['tsconfig.*?.json'], ['**/*.js']), // JS-only — not the winner
    null,
    'string-entry',
  ];
  assert.deepEqual(effectiveProjectGlobs(config), ['lib/a/tsconfig.json']);
});

// --- findProjectConfigDirs ---

test('findProjectConfigDirs finds nested configs and skips node_modules/dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'anchored-'));
  try {
    for (const dir of [
      'lib/alpha',
      'tools/mcp/beta',
      'lib/alpha/node_modules/pkg',
      'lib/alpha/dist',
      'apps/gamma',
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, CONFIG_FILENAME), 'export default [];');
    }
    // A plain source directory carrying no config of its own.
    mkdirSync(join(root, 'apps/gamma/src'), { recursive: true });

    const found = findProjectConfigDirs(root, PROJECT_ROOTS);

    assert.deepEqual(found, ['apps/gamma', 'lib/alpha', 'tools/mcp/beta']);
    assert.ok(!found.some((d) => d.includes('node_modules')));
    assert.ok(!found.some((d) => d.includes('dist')));
    // src/ has no config of its own and must not be reported.
    assert.ok(!found.includes('apps/gamma/src'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- end-to-end against the real workspace ---

test('every project in this repo anchors parserOptions.project', () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'scripts', 'check-eslint-tsconfig-anchored.mjs')],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(
    result.status,
    0,
    `check-eslint-tsconfig-anchored.mjs failed:\n${result.stdout}${result.stderr}`,
  );
});
