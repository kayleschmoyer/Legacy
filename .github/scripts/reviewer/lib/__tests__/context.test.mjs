import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseChangedFilePaths,
  formatContextForPrompt,
  fetchContext,
} from '../context.mjs';

describe('parseChangedFilePaths', () => {
  it('extracts the post-image (b/) path for each changed file', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 111..222 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    assert.deepStrictEqual(parseChangedFilePaths(diff), ['src/foo.ts']);
  });

  it('uses the new path for renames', () => {
    const diff = 'diff --git a/old/name.ts b/new/name.ts\n';
    assert.deepStrictEqual(parseChangedFilePaths(diff), ['new/name.ts']);
  });

  it('filters a /dev/null post-image (defensive)', () => {
    const diff = 'diff --git a/gone.ts b//dev/null\n';
    assert.deepStrictEqual(parseChangedFilePaths(diff), []);
  });

  it('deduplicates repeated file headers', () => {
    const diff =
      'diff --git a/a.ts b/a.ts\n' +
      'diff --git a/b.ts b/b.ts\n' +
      'diff --git a/a.ts b/a.ts\n';
    assert.deepStrictEqual(parseChangedFilePaths(diff).sort(), [
      'a.ts',
      'b.ts',
    ]);
  });

  it('returns [] for empty or missing diff', () => {
    assert.deepStrictEqual(parseChangedFilePaths(''), []);
    assert.deepStrictEqual(parseChangedFilePaths(undefined), []);
  });
});

describe('formatContextForPrompt', () => {
  const ctx = {
    fullFiles: { 'src/a.ts': 'AAA', 'src/b.ts': 'BBB' },
    importFiles: { 'src/util.ts': 'UTIL' },
    testFiles: {},
    configFiles: { '.eslintrc.json': '{ "no-console": "off" }' },
    jiraTicket: null,
  };

  it('includes full file contents and section headers', () => {
    const out = formatContextForPrompt(ctx);
    assert.ok(out.includes('## Full file contents'));
    assert.ok(out.includes('### src/a.ts'));
    assert.ok(out.includes('AAA'));
    assert.ok(out.includes('## Imported modules'));
    assert.ok(out.includes('UTIL'));
    assert.ok(out.includes('no-console'));
  });

  it('omits empty sections', () => {
    const out = formatContextForPrompt(ctx);
    assert.ok(!out.includes('## Test files'));
  });

  it('truncates to the byte budget and notes the omission', () => {
    // 55 bytes fits the header + first full file but not the second.
    const out = formatContextForPrompt(ctx, { maxBytes: 55 });
    assert.ok(out.includes('AAA'), 'first file should fit');
    assert.ok(!out.includes('BBB'), 'second file should be dropped');
    assert.ok(out.includes('omitted to stay within the size budget'));
  });

  it('includes the Jira ticket when present and budget allows', () => {
    const out = formatContextForPrompt({
      ...ctx,
      jiraTicket: 'LS-1: do thing',
    });
    assert.ok(out.includes('## Linked Jira ticket'));
    assert.ok(out.includes('LS-1: do thing'));
  });
});

describe('fetchContext — per-directory eslintrc overrides (LS-7768)', () => {
  let dir;
  let prevCwd;

  before(() => {
    prevCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'reviewer-ctx-'));
    mkdirSync(join(dir, 'apps/web-e2e/src/integration/tests'), {
      recursive: true,
    });
    // Local override that disables no-console for the integration suite — the
    // reviewer must be able to see this so it stops flagging sanctioned console.*.
    writeFileSync(
      join(dir, 'apps/web-e2e/.eslintrc.json'),
      JSON.stringify({ rules: { 'no-console': 'off' } }),
    );
    writeFileSync(
      join(dir, 'apps/web-e2e/src/integration/tests/x.integration.spec.ts'),
      'console.log("live backend");\n',
    );
    process.chdir(dir);
  });

  after(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('surfaces the nearest ancestor .eslintrc.json in configFiles', async () => {
    const ctx = await fetchContext({
      changedFiles: [
        'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
      ],
    });
    const eslintPath = Object.keys(ctx.configFiles).find((p) =>
      p.endsWith('.eslintrc.json'),
    );
    assert.ok(eslintPath, 'should locate an ancestor .eslintrc.json');
    assert.ok(
      ctx.configFiles[eslintPath].includes('no-console'),
      'eslintrc content should expose the no-console override',
    );
  });
});
