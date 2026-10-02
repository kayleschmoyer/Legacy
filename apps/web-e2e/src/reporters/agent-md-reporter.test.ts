import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import AgentMarkdownReporter from './agent-md-reporter';

/**
 * Unit tests for the agent-md-reporter's file outputs (LS-10337).
 *
 * Regression guard for the E2E ledger never reaching S3: the reporter used
 * to resolve relative output paths against `config.rootDir`, which Playwright
 * sets to the resolved `testDir` — so the CI merge-reports pass (merge config
 * `testDir: "apps/web-e2e/src"`) wrote summary.md / flaky-tests.json /
 * e2e-ledger.json under `apps/web-e2e/src/` while the workflow looked at the
 * workspace root. Built-in reporters resolve against the Playwright-injected
 * `configDir` option instead; this suite pins that behaviour by driving the
 * reporter with a rootDir that differs from configDir.
 */

type Outcome = ReturnType<TestCase['outcome']>;

interface FakeTestSpec {
  file: string;
  title: string;
  outcome: Outcome;
  /** Number of attempts (1 = no retries). */
  attempts?: number;
  describe?: string;
}

function makeSuite(rootDir: string, specs: FakeTestSpec[]): Suite {
  const tests: TestCase[] = specs.map((spec) => {
    const describeSuite = spec.describe
      ? ({ type: 'describe', title: spec.describe, parent: undefined } as Suite)
      : undefined;
    const results: TestResult[] = Array.from(
      { length: spec.attempts ?? 1 },
      () => ({ errors: [] }) as unknown as TestResult,
    );
    return {
      title: spec.title,
      parent: describeSuite,
      location: { file: join(rootDir, spec.file), line: 1, column: 1 },
      annotations: [],
      results,
      outcome: () => spec.outcome,
    } as unknown as TestCase;
  });
  return { allTests: () => tests } as unknown as Suite;
}

function run(
  reporter: AgentMarkdownReporter,
  rootDir: string,
  specs: FakeTestSpec[],
  status: FullResult['status'] = 'passed',
): void {
  reporter.onBegin({ rootDir } as FullConfig, makeSuite(rootDir, specs));
  reporter.onEnd({ status } as FullResult);
}

const SPECS: FakeTestSpec[] = [
  { file: 'a.spec.ts', title: 'passes', outcome: 'expected' },
  {
    file: 'b.spec.ts',
    title: 'fails',
    outcome: 'unexpected',
    attempts: 2,
    describe: 'group',
  },
  { file: 'c.spec.ts', title: 'flakes', outcome: 'flaky', attempts: 3 },
  { file: 'd.spec.ts', title: 'skipped', outcome: 'skipped' },
];

void test('AgentMarkdownReporter outputs', async (t) => {
  let base: string;
  let configDir: string;
  let rootDir: string;

  t.beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'agent-md-reporter-'));
    // Mirror CI's merge-reports layout: the merge config lives at the
    // workspace root while rootDir (= merge config testDir) is a subdir.
    configDir = base;
    rootDir = join(base, 'apps', 'web-e2e', 'src');
  });
  t.afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  await t.test(
    'relative output paths resolve against configDir, not rootDir',
    () => {
      run(
        new AgentMarkdownReporter({
          configDir,
          outputFile: 'summary.md',
          flakyJsonFile: 'flaky-tests.json',
          ledgerJsonFile: 'e2e-ledger.json',
        }),
        rootDir,
        SPECS,
        'failed',
      );

      for (const name of [
        'summary.md',
        'flaky-tests.json',
        'e2e-ledger.json',
      ]) {
        assert.equal(
          existsSync(join(configDir, name)),
          true,
          `${name} should be written next to the config file`,
        );
        assert.equal(
          existsSync(join(rootDir, name)),
          false,
          `${name} must not be written under rootDir (the LS-10337 bug)`,
        );
      }
    },
  );

  await t.test('ledger JSON lists every executed test, excluding skips', () => {
    run(
      new AgentMarkdownReporter({
        configDir,
        outputFile: 'summary.md',
        ledgerJsonFile: 'e2e-ledger.json',
      }),
      rootDir,
      SPECS,
      'failed',
    );

    const ledger = JSON.parse(
      readFileSync(join(configDir, 'e2e-ledger.json'), 'utf-8'),
    ) as { entries: unknown[] };
    assert.deepEqual(ledger, {
      entries: [
        {
          spec: 'a.spec.ts',
          testName: 'passes',
          status: 'passed',
          retryCount: 0,
        },
        {
          spec: 'b.spec.ts',
          testName: 'group › fails',
          status: 'failed',
          retryCount: 1,
        },
        {
          spec: 'c.spec.ts',
          testName: 'flakes',
          status: 'flaky',
          retryCount: 2,
        },
      ],
    });
  });

  await t.test('flaky JSON is written even when no test was flaky', () => {
    run(
      new AgentMarkdownReporter({
        configDir,
        outputFile: 'summary.md',
        flakyJsonFile: 'flaky-tests.json',
      }),
      rootDir,
      [SPECS[0]],
    );
    const flaky = JSON.parse(
      readFileSync(join(configDir, 'flaky-tests.json'), 'utf-8'),
    ) as { total: number; flaky: unknown[] };
    assert.deepEqual(flaky, { total: 1, flaky: [] });
  });

  await t.test(
    'ledger and flaky files are not written unless configured',
    () => {
      run(
        new AgentMarkdownReporter({ configDir, outputFile: 'summary.md' }),
        rootDir,
        SPECS,
      );
      assert.equal(existsSync(join(configDir, 'summary.md')), true);
      assert.equal(existsSync(join(configDir, 'e2e-ledger.json')), false);
      assert.equal(existsSync(join(configDir, 'flaky-tests.json')), false);
    },
  );

  await t.test(
    'falls back to rootDir when Playwright injects no configDir',
    () => {
      run(
        new AgentMarkdownReporter({
          outputFile: 'out/summary.md',
          ledgerJsonFile: 'out/e2e-ledger.json',
        }),
        rootDir,
        [SPECS[0]],
      );
      assert.equal(existsSync(join(rootDir, 'out', 'summary.md')), true);
      assert.equal(existsSync(join(rootDir, 'out', 'e2e-ledger.json')), true);
    },
  );

  await t.test('absolute output paths are used as-is', () => {
    const abs = resolve(base, 'elsewhere', 'ledger.json');
    run(
      new AgentMarkdownReporter({
        configDir,
        outputFile: 'summary.md',
        ledgerJsonFile: abs,
      }),
      rootDir,
      [SPECS[0]],
    );
    assert.equal(existsSync(abs), true);
  });
});
