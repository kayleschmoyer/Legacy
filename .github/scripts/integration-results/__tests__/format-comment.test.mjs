import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = '.github/scripts/integration-results/format-comment.mjs';

function run(reportPath, extraArgs = []) {
  return execFileSync(
    process.execPath,
    [SCRIPT, '--report', reportPath, ...extraArgs],
    { encoding: 'utf8' },
  );
}

describe('format-comment.mjs (LS-4617)', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'format-comment-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits one <integration-results> block per spec with status + duration', () => {
    const reportPath = join(dir, 'report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        suites: [
          {
            file: 'apps/web-e2e/src/integration/tests/foo.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/foo.integration.spec.ts',
                title: 'flow A',
                tests: [{ results: [{ status: 'passed', duration: 1234 }] }],
              },
            ],
          },
          {
            file: 'apps/web-e2e/src/integration/tests/bar.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/bar.integration.spec.ts',
                title: 'flow B',
                tests: [{ results: [{ status: 'failed', duration: 999 }] }],
              },
            ],
          },
        ],
      }),
    );
    const out = run(reportPath, ['--report-url', 'https://example.test/r/1']);
    assert.match(out, /## Integration Test Results/);
    const fooMatch = out.match(
      /<integration-results>\nspec: apps\/web-e2e\/src\/integration\/tests\/foo\.integration\.spec\.ts\nstatus: passed\nduration_ms: 1234\nreport: https:\/\/example\.test\/r\/1\n<\/integration-results>/,
    );
    assert.ok(fooMatch, `expected foo block in:\n${out}`);
    const barMatch = out.match(
      /<integration-results>\nspec: apps\/web-e2e\/src\/integration\/tests\/bar\.integration\.spec\.ts\nstatus: failed\nduration_ms: 999\nreport: https:\/\/example\.test\/r\/1\n<\/integration-results>/,
    );
    assert.ok(barMatch, `expected bar block in:\n${out}`);
  });

  it('takes the worst status across multiple results for the same spec', () => {
    const reportPath = join(dir, 'worst.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        suites: [
          {
            file: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
                title: 'flow X',
                tests: [
                  { results: [{ status: 'passed', duration: 10 }] },
                  { results: [{ status: 'failed', duration: 20 }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    const out = run(reportPath);
    assert.match(out, /status: failed/);
    assert.match(out, /duration_ms: 30/);
  });

  it('filters output to --specs when provided', () => {
    const reportPath = join(dir, 'filter.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        suites: [
          {
            file: 'apps/web-e2e/src/integration/tests/keep.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/keep.integration.spec.ts',
                title: 't',
                tests: [{ results: [{ status: 'passed', duration: 1 }] }],
              },
            ],
          },
          {
            file: 'apps/web-e2e/src/integration/tests/drop.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/drop.integration.spec.ts',
                title: 't',
                tests: [{ results: [{ status: 'passed', duration: 1 }] }],
              },
            ],
          },
        ],
      }),
    );
    const out = run(reportPath, [
      '--specs',
      'apps/web-e2e/src/integration/tests/keep.integration.spec.ts',
    ]);
    assert.match(out, /keep\.integration\.spec\.ts/);
    assert.equal(/drop\.integration\.spec\.ts/.test(out), false);
  });

  it('emits an explanatory line when no specs match the filter', () => {
    const reportPath = join(dir, 'empty.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        suites: [
          {
            file: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
            specs: [
              {
                file: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
                title: 't',
                tests: [{ results: [{ status: 'passed', duration: 1 }] }],
              },
            ],
          },
        ],
      }),
    );
    const out = run(reportPath, [
      '--specs',
      'apps/web-e2e/src/integration/tests/missing.integration.spec.ts',
    ]);
    assert.equal(/<integration-results>/.test(out), false);
    assert.match(out, /No integration spec results matched/);
  });
});
