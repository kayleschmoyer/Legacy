/**
 * Tests for scripts/check-workspace-deps.mjs (LS-8622).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-workspace-deps.test.mjs
 *
 * The check exists because TypeScript resolves @legacy-sports/* imports via
 * tsconfig paths (keeping PR gates green) while Metro resolves via
 * node_modules — so an undeclared workspace dependency only fails after
 * merge, in the Android build's bundle step (LS-8617).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  extractSpecifiers,
  packageNameOf,
  declaredDependencies,
  checkPackage,
  findPackageDirs,
  workspacePackageNames,
} from '../check-workspace-deps.mjs';

// --- extractSpecifiers ---

test('extractSpecifiers finds static import/export-from specifiers', () => {
  const src = [
    "import { LOGGER } from '@legacy-sports/logging';",
    'import type { Foo } from "@legacy-sports/graphql";',
    "export { bar } from '@legacy-sports/utils/node';",
    "export * from '@legacy-sports/scoring';",
  ].join('\n');
  const specs = extractSpecifiers(src).map((s) => s.specifier);
  assert.deepEqual(specs, [
    '@legacy-sports/logging',
    '@legacy-sports/graphql',
    '@legacy-sports/utils/node',
    '@legacy-sports/scoring',
  ]);
});

test('extractSpecifiers finds require, dynamic import, side-effect import, and jest hooks', () => {
  const src = [
    "const { db } = require('@legacy-sports/db-client');",
    "const path = require.resolve('@legacy-sports/design-tokens');",
    "const mod = await import('@legacy-sports/analytics');",
    "import '@legacy-sports/tamagui-config';",
    "jest.mock('@legacy-sports/logging');",
    "const real = jest.requireActual('@legacy-sports/utils');",
  ].join('\n');
  const specs = extractSpecifiers(src).map((s) => s.specifier);
  assert.equal(specs.length, 6);
  assert.ok(specs.includes('@legacy-sports/design-tokens'));
  assert.ok(specs.includes('@legacy-sports/tamagui-config'));
});

test('extractSpecifiers ignores non-workspace specifiers and reports line numbers', () => {
  const src = [
    "import React from 'react';",
    "import { X } from '@tamagui/core';",
    "import { Y } from '@legacy-sports/api';",
  ].join('\n');
  const specs = extractSpecifiers(src);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].specifier, '@legacy-sports/api');
  assert.equal(specs[0].line, 3);
});

// --- packageNameOf ---

test('packageNameOf reduces deep imports to the package name', () => {
  assert.equal(
    packageNameOf('@legacy-sports/utils/node'),
    '@legacy-sports/utils',
  );
  assert.equal(
    packageNameOf('@legacy-sports/shared-components/utils'),
    '@legacy-sports/shared-components',
  );
  assert.equal(
    packageNameOf('@legacy-sports/logging'),
    '@legacy-sports/logging',
  );
});

// --- declaredDependencies ---

test('declaredDependencies unions all dependency blocks', () => {
  const declared = declaredDependencies({
    dependencies: { a: '1' },
    devDependencies: { b: '1' },
    peerDependencies: { c: '1' },
    optionalDependencies: { d: '1' },
  });
  assert.deepEqual([...declared].sort(), ['a', 'b', 'c', 'd']);
});

// --- checkPackage / findPackageDirs / workspacePackageNames on a fixture repo ---

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'ws-deps-'));
  // Declared dependency target
  mkdirSync(join(root, 'lib', 'logging', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'lib', 'logging', 'package.json'),
    JSON.stringify({ name: '@legacy-sports/logging' }),
  );
  // Workspace package that will import things
  mkdirSync(join(root, 'apps', 'app', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'apps', 'app', 'package.json'),
    JSON.stringify({
      name: '@legacy-sports/app',
      dependencies: { '@legacy-sports/logging': 'workspace:*' },
    }),
  );
  // Undeclared dependency target (a real workspace package)
  mkdirSync(join(root, 'lib', 'design-tokens', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'lib', 'design-tokens', 'package.json'),
    JSON.stringify({ name: '@legacy-sports/design-tokens' }),
  );
  // tsconfig-paths-only Nx lib: directory, no package.json
  mkdirSync(join(root, 'lib', 'scheduling', 'src'), { recursive: true });
  return root;
}

test('checkPackage flags undeclared workspace imports (the LS-8617 case)', () => {
  const root = makeFixtureRepo();
  try {
    writeFileSync(
      join(root, 'apps', 'app', 'src', 'theme.ts'),
      [
        "import { LOGGER } from '@legacy-sports/logging';", // declared
        "import { tokens } from '@legacy-sports/design-tokens';", // NOT declared
        "import { plan } from '@legacy-sports/scheduling';", // paths-only lib — skipped
        "import { self } from '@legacy-sports/app';", // self-import — skipped
      ].join('\n'),
    );
    const names = workspacePackageNames(root);
    const violations = checkPackage(join(root, 'apps', 'app'), names, root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].dependency, '@legacy-sports/design-tokens');
    assert.equal(violations[0].package, '@legacy-sports/app');
    assert.equal(violations[0].file, 'apps/app/src/theme.ts');
    assert.equal(violations[0].line, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkPackage skips build output and native directories', () => {
  const root = makeFixtureRepo();
  try {
    for (const dir of ['node_modules', 'dist', 'android']) {
      mkdirSync(join(root, 'apps', 'app', dir), { recursive: true });
      writeFileSync(
        join(root, 'apps', 'app', dir, 'gen.js'),
        "import { tokens } from '@legacy-sports/design-tokens';",
      );
    }
    const names = workspacePackageNames(root);
    const violations = checkPackage(join(root, 'apps', 'app'), names, root);
    assert.equal(violations.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findPackageDirs only returns dirs with a package.json', () => {
  const root = makeFixtureRepo();
  try {
    const dirs = findPackageDirs(root).map((d) => d.slice(root.length + 1));
    assert.deepEqual(dirs.map((d) => d.split(/[\\/]/).join('/')).sort(), [
      'apps/app',
      'lib/design-tokens',
      'lib/logging',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspacePackageNames excludes paths-only Nx libs', () => {
  const root = makeFixtureRepo();
  try {
    const names = workspacePackageNames(root);
    assert.ok(names.has('@legacy-sports/design-tokens'));
    assert.ok(!names.has('@legacy-sports/scheduling'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
