import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EXECUTED_PATHS_EXPRESSION, executedCoveragePaths } from './coverage';

/**
 * Evaluate the exact source shipped to page.evaluate in a fresh VM context with
 * no access to this module's scope (proves no closure/import references), then
 * JSON round-trip the result the way CDP serialises it back to Node.
 */
function evaluateInPage(window: object): unknown {
  return JSON.parse(
    JSON.stringify(vm.runInNewContext(EXECUTED_PATHS_EXPRESSION, { window })),
  );
}

const coverage = {
  '/repo/apps/web/src/a.tsx': {
    path: '/repo/apps/web/src/a.tsx',
    s: { '0': 0, '1': 3 },
    statementMap: { '0': {}, '1': {} },
  },
  '/repo/apps/web/src/unexecuted.tsx': {
    path: '/repo/apps/web/src/unexecuted.tsx',
    s: { '0': 0, '1': 0 },
  },
  '/repo/lib/shared/b.ts': { path: '/repo/lib/shared/b.ts', s: { '0': 1 } },
  '/repo/lib/shared/no-statements.ts': {
    path: '/repo/lib/shared/no-statements.ts',
    s: {},
  },
  '/repo/lib/shared/no-counts.ts': { path: '/repo/lib/shared/no-counts.ts' },
  '/repo/lib/shared/no-path.ts': { s: { '0': 5 } },
};

const EXPECTED = ['/repo/apps/web/src/a.tsx', '/repo/lib/shared/b.ts'];

void test('executedCoveragePaths keeps only files with an executed statement', () => {
  assert.deepEqual(executedCoveragePaths(coverage), EXPECTED);
});

void test('executedCoveragePaths tolerates a missing / non-object coverage map', () => {
  assert.deepEqual(executedCoveragePaths(undefined), []);
  assert.deepEqual(executedCoveragePaths(null), []);
  assert.deepEqual(executedCoveragePaths({}), []);
});

void test('in-page expression is self-contained and filters window.__coverage__', () => {
  assert.deepEqual(evaluateInPage({ __coverage__: coverage }), EXPECTED);
});

void test('in-page expression returns [] on an uninstrumented page', () => {
  assert.deepEqual(evaluateInPage({}), []);
});
