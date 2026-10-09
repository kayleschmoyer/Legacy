import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { summarizeTap, validateFile } from '../run-node-tests.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../run-node-tests.mjs',
);

describe('validateFile', () => {
  it('accepts allowed files', () => {
    assert.equal(
      validateFile('github', '.github/scripts/__tests__/a.test.mjs'),
      null,
    );
    assert.equal(
      validateFile('github', '.github/scripts/x/__tests__/a.test.mjs'),
      null,
    );
    assert.equal(validateFile('root', 'scripts/__tests__/a.test.mjs'), null);
  });

  it('refuses shell metacharacters', () => {
    for (const f of [
      'scripts/__tests__/a.test.mjs;rm',
      'scripts/__tests__/$(x).test.mjs',
      'scripts/__tests__/a b.test.mjs',
      'scripts/__tests__/a.test.mjs|x',
    ]) {
      assert.match(validateFile('root', f), /characters outside/);
    }
  });

  it('refuses paths outside the allowed directories', () => {
    assert.ok(validateFile('root', 'package.json'));
    assert.ok(validateFile('root', '../x/__tests__/a.test.mjs'));
    assert.ok(validateFile('root', '/etc/__tests__/a.test.mjs'));
    assert.ok(validateFile('root', 'scripts/other/a.test.mjs'));
    assert.ok(validateFile('root', 'scripts/x/__tests__/a.test.mjs'));
    assert.ok(validateFile('root', '.github/scripts/__tests__/a.test.mjs'));
    assert.ok(validateFile('github', 'scripts/__tests__/a.test.mjs'));
    assert.ok(validateFile('github', '.github/scripts/__tests__/a.js'));
  });
});

describe('summarizeTap', () => {
  it('keeps every not ok line and the summary counts', () => {
    const tap = [
      'TAP version 13',
      'ok 1 - a',
      'not ok 2 - b',
      '  not ok 1 - nested',
      'not ok 3 - c',
      '# tests 3',
      '# pass 1',
      '# fail 2',
    ].join('\n');
    const { failures, summary } = summarizeTap(tap);
    assert.equal(failures.length, 3);
    assert.deepEqual(summary, ['# tests 3', '# pass 1', '# fail 2']);
  });
});

describe('CLI', () => {
  it('runs a single file and reports counts', () => {
    const r = spawnSync(
      process.execPath,
      [SCRIPT, 'root', 'scripts/__tests__/check-case-collisions.test.mjs'],
      { encoding: 'utf8' },
    );
    assert.match(r.stdout, /# pass \d+/);
  });

  it('refuses a bad FILE with a non-zero exit', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'root', 'package.json'], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Refused/);
  });
});
