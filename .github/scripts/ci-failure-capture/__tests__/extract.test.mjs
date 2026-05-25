/**
 * Unit tests for the CI failure log distiller (extract.js).
 *
 * Run via: node --test .github/scripts/ci-failure-capture/__tests__/extract.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { distill, redact, stripAnsi, matchesGlob } = require(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../extract.js'),
);

describe('distill — eslint/lint', () => {
  const log = [
    '> nx run web:lint',
    '',
    '/repo/apps/web/src/foo.ts',
    "  12:5  error  'x' is assigned a value but never used  @typescript-eslint/no-unused-vars",
    '  20:1  error  Unexpected console statement  no-console',
    '',
    '✖ 2 problems (2 errors, 0 warnings)',
    '',
    ' NX   Ran target lint for 12 projects (4s)',
    '   ✖  1/12 failed',
    '      - web:lint',
  ].join('\n');

  it('keeps the violations, file header and summary', () => {
    const { excerpt, summary } = distill({ tool: 'lint', text: log });
    assert.match(excerpt, /foo\.ts/);
    assert.match(excerpt, /no-unused-vars/);
    assert.match(excerpt, /no-console/);
    assert.match(excerpt, /2 problems/);
    assert.equal(summary, '2 ESLint errors');
  });
});

describe('distill — typecheck + jest (test)', () => {
  const log = [
    '> nx run api:typecheck',
    'src/handler.ts(42,7): error TS2322: Type "string" is not assignable to type "number".',
    '> nx run api:test',
    'FAIL src/handler.test.ts',
    '  ● adds two numbers',
    '    Expected: 4',
    '    Received: 5',
    'Tests:       1 failed, 7 passed, 8 total',
  ].join('\n');

  it('captures the TS error and the jest failure', () => {
    const { excerpt, summary } = distill({ tool: 'test', text: log });
    assert.match(excerpt, /error TS2322/);
    assert.match(excerpt, /● adds two numbers/);
    assert.match(excerpt, /Expected: 4/);
    // TS errors are summarised first when present.
    assert.equal(summary, '1 TypeScript error');
  });

  it('summarises jest failures when there is no TS error', () => {
    const jestOnly = [
      'FAIL src/a.test.ts',
      '  ● boom',
      'Tests:       3 failed, 1 passed, 4 total',
    ].join('\n');
    const { summary } = distill({ tool: 'test', text: jestOnly });
    assert.equal(summary, '3 tests failed');
  });
});

describe('distill — prettier (format)', () => {
  const log = [
    'Checking formatting...',
    '[warn] apps/web/src/foo.ts',
    '[warn] lib/util/bar.ts',
    '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
  ].join('\n');

  it('lists unformatted files and counts them', () => {
    const { excerpt, summary } = distill({ tool: 'format', text: log });
    assert.match(excerpt, /foo\.ts/);
    assert.match(excerpt, /bar\.ts/);
    assert.equal(summary, '2 files need formatting');
  });
});

describe('distill — redaction', () => {
  it('masks secret-shaped tokens before they reach a comment', () => {
    const log = [
      'env DEBUG: password=hunter2 should be hidden',
      'aws key AKIAIOSFODNN7EXAMPLE leaked',
      'connecting to postgres://user:s3cr3tpw@db.internal:5432/app',
      'authorization: Bearer abcdef.ghijkl.mnopqr',
    ].join('\n');
    const { excerpt } = distill({ tool: 'generic', text: log });
    assert.doesNotMatch(excerpt, /hunter2/);
    assert.doesNotMatch(excerpt, /AKIAIOSFODNN7EXAMPLE/);
    assert.doesNotMatch(excerpt, /s3cr3tpw/);
    assert.match(excerpt, /«redacted»|«aws-key»/);
  });
});

describe('distill — capping & edge cases', () => {
  it('truncates long logs and notes the omission with a run url', () => {
    const lines = [];
    for (let i = 0; i < 400; i++) lines.push(`error: failure number ${i}`);
    const { excerpt, truncated } = distill({
      tool: 'generic',
      text: lines.join('\n'),
      maxLines: 30,
      runUrl: 'https://example.com/run/1',
    });
    assert.equal(truncated, true);
    assert.match(excerpt, /more lines omitted/);
    assert.match(excerpt, /example\.com\/run\/1/);
    assert.ok(excerpt.split('\n').length <= 31);
  });

  it('handles empty input', () => {
    const { excerpt } = distill({ tool: 'lint', text: '' });
    assert.match(excerpt, /No output/);
  });

  it('falls back to the tail when nothing matches a signal', () => {
    const text = ['just', 'some', 'boring', 'unremarkable', 'lines'].join('\n');
    const { excerpt } = distill({ tool: 'generic', text });
    assert.match(excerpt, /lines/);
  });
});

describe('matchesGlob', () => {
  it('matches a single trailing/middle wildcard', () => {
    assert.equal(matchesGlob('build-web-123.log', 'build-*.log'), true);
    assert.equal(
      matchesGlob('terraform-main-init.log', 'terraform-*-init.log'),
      true,
    );
    assert.equal(matchesGlob('build-.log', 'build-*.log'), true);
  });

  it('rejects non-matches', () => {
    assert.equal(matchesGlob('ci-lint.log', 'build-*.log'), false);
    assert.equal(matchesGlob('build-web.log.bak', 'build-*.log'), false);
    assert.equal(
      matchesGlob('terraform-main-validate.log', 'terraform-*-init.log'),
      false,
    );
  });

  it('treats shell metacharacters as literal text, never executing them', () => {
    // The whole point of globbing in Node: a pattern like this is matched as
    // literal characters, not expanded or executed by a shell.
    assert.equal(matchesGlob('$(whoami).log', '*.log'), true);
    assert.equal(matchesGlob('innocent.log', '$(whoami)*'), false);
  });
});

describe('helpers', () => {
  it('stripAnsi removes colour codes', () => {
    assert.equal(stripAnsi('[31mred[0m'), 'red');
  });

  it('redact is idempotent on clean text', () => {
    assert.equal(redact('all good here'), 'all good here');
  });
});
