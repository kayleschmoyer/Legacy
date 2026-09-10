/**
 * Guards the `test:github-scripts` npm script (LS-9964).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/test-github-scripts-glob.test.mjs
 *
 * This suite deliberately lives under scripts/__tests__/ rather than
 * .github/scripts/__tests__/, because it guards the very script that runs the
 * latter — a guard living inside the set it protects could be silenced by the
 * same bug. scripts/__tests__/ is wired into CI independently via
 * `pnpm run test:scripts`.
 *
 * The failure mode being pinned is silent, not loud: `node --test` given a
 * pattern that matches nothing runs zero tests and exits 0. That is
 * indistinguishable from success in CI, and is exactly the "no tasks were run,
 * exit 0" hole in `nx affected -t test` that LS-9964 was filed to close.
 * Reintroducing it via a typo'd pattern — or via single quotes, which cmd.exe
 * (Make's and npm's default shell on native Windows) passes through literally
 * instead of stripping — would restore the hole while CI stayed green.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { globSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function testGithubScriptsCommand() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const command = pkg.scripts?.['test:github-scripts'];
  assert.ok(command, 'package.json must define a test:github-scripts script');
  return command;
}

/** Every *.test.mjs under any __tests__ directory in .github/scripts/. */
function walkSuites(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkSuites(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.test.mjs') &&
      dirname(full).endsWith('__tests__')
    ) {
      found.push(full);
    }
  }
  return found;
}

test('test:github-scripts glob matches every suite under .github/scripts', () => {
  const command = testGithubScriptsCommand();
  const pattern = command.match(/"([^"]+)"/)?.[1];
  assert.ok(
    pattern,
    `expected a double-quoted glob in test:github-scripts, got: ${command}`,
  );

  const matched = globSync(pattern, { cwd: repoRoot }).sort();
  const onDisk = walkSuites(join(repoRoot, '.github', 'scripts'))
    .map((f) => f.slice(repoRoot.length + 1).replace(/\\/g, '/'))
    .sort();

  // The load-bearing assertion: a pattern matching nothing would let
  // `node --test` exit 0 having run no tests at all.
  assert.ok(
    matched.length > 0,
    `test:github-scripts pattern "${pattern}" matched no files — ` +
      'node --test would exit 0 without running anything',
  );
  assert.deepEqual(
    matched.map((f) => f.replace(/\\/g, '/')),
    onDisk,
    'test:github-scripts must run exactly the suites present on disk',
  );
});

test('test:github-scripts avoids single quotes (cmd.exe passes them through)', () => {
  const command = testGithubScriptsCommand();
  assert.ok(
    !command.includes("'"),
    'single quotes are not stripped by cmd.exe (npm/Make default shell on ' +
      'native Windows), so node would receive a literal quoted pattern, match ' +
      `nothing, and exit 0. Use double quotes. Got: ${command}`,
  );
});
