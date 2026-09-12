import { describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// project-resolution.ts reaches run-command.ts, whose import.meta usage the
// spec tsconfig's module target rejects — the same mock run-target.spec.ts
// uses. buildProjectNotFoundHint is exercised there, not here.
jest.mock('../project-resolution.js', () => ({
  buildProjectNotFoundHint: jest.fn(),
}));

import {
  buildJestReportResult,
  newJestReportFile,
} from './jest-report-result.js';
import type { JobSnapshot } from '../jobs.js';

const ESC = String.fromCharCode(27);

function snapshot(
  overrides: Partial<JobSnapshot> & { meta?: Record<string, unknown> } = {},
): JobSnapshot {
  return {
    jobId: 'nx-1',
    status: 'failed',
    label: 'nx run mcp-jira-server:test',
    elapsedSec: 12,
    log: 'jest output',
    ...overrides,
  } as JobSnapshot;
}

async function writeReport(body: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nx-mcp-jest-spec-'));
  const file = path.join(dir, 'report.json');
  await writeFile(file, JSON.stringify(body), 'utf-8');
  return file;
}

const FAILING_REPORT = {
  success: false,
  numTotalTests: 3,
  numPassedTests: 1,
  numFailedTests: 2,
  numFailedTestSuites: 1,
  testResults: [
    {
      name: '/repo/tools/mcp/jira-server/claim.spec.ts',
      status: 'failed',
      assertionResults: [
        {
          status: 'failed',
          fullName: 'claim > returns PROCEED',
          failureMessages: ['expected PROCEED'],
        },
        {
          status: 'failed',
          fullName: 'claim > sets assignee',
          failureMessages: ['expected assignee'],
        },
        { status: 'passed', fullName: 'claim > ok' },
      ],
    },
  ],
};

describe('newJestReportFile', () => {
  it('returns a unique absolute path per call', () => {
    const a = newJestReportFile();
    const b = newJestReportFile();
    expect(path.isAbsolute(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('buildJestReportResult', () => {
  it('returns the parsed failure list and no raw output in summary mode', async () => {
    const outputFile = await writeReport(FAILING_REPORT);
    const result = await buildJestReportResult(
      snapshot({
        meta: {
          kind: 'jest-report',
          mode: 'summary',
          outputFile,
          project: 'mcp-jira-server',
          target: 'test',
        },
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.body).toMatchObject({
      project: 'mcp-jira-server',
      target: 'test',
      passed: false,
      numFailedTests: 2,
      numPassedTests: 1,
      numTotalTests: 3,
      numFailedTestSuites: 1,
    });
    expect(result.body.failures).toHaveLength(2);
    expect(result.body.output).toBeUndefined();
  });

  it('includes the ANSI-stripped raw output in json mode', async () => {
    const outputFile = await writeReport(FAILING_REPORT);
    const result = await buildJestReportResult(
      snapshot({
        log: `${ESC}[31m● claim > returns PROCEED${ESC}[0m`,
        meta: { kind: 'jest-report', mode: 'json', outputFile },
      }),
    );

    expect(result.body.output).toBe('● claim > returns PROCEED');
    expect(result.body.failures).toHaveLength(2);
  });

  it('deletes the temp report file after reading it', async () => {
    const outputFile = await writeReport(FAILING_REPORT);
    await buildJestReportResult(
      snapshot({ meta: { kind: 'jest-report', mode: 'summary', outputFile } }),
    );
    await expect(readFile(outputFile, 'utf-8')).rejects.toThrow();
  });

  it('falls back to raw output with a hint when no report was written', async () => {
    const result = await buildJestReportResult(
      snapshot({
        status: 'done',
        log: 'Successfully ran target test (nx cache replay — jest never ran)',
        meta: {
          kind: 'jest-report',
          mode: 'summary',
          outputFile: path.join(os.tmpdir(), 'definitely-not-written.json'),
        },
      }),
    );

    expect(result.body.reportUnavailable).toContain('noCache: true');
    expect(result.body.output).toBe(
      'Successfully ran target test (nx cache replay — jest never ran)',
    );
    expect(result.body.passed).toBe(true);
    expect(result.isError).toBe(false);
  });

  it('reports passed:true for a green run', async () => {
    const outputFile = await writeReport({
      success: true,
      numTotalTests: 2,
      numPassedTests: 2,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      testResults: [],
    });
    const result = await buildJestReportResult(
      snapshot({
        status: 'done',
        log: 'Successfully ran target test for project web',
        meta: { kind: 'jest-report', mode: 'summary', outputFile },
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.body).toMatchObject({ passed: true, numFailedTests: 0 });
  });

  it('flags a daemon failure that exited 0 (LS-8819) rather than a false green', async () => {
    const outputFile = await writeReport(FAILING_REPORT);
    const result = await buildJestReportResult(
      snapshot({
        status: 'done',
        log: 'Nx Daemon was not able to compute the project graph',
        meta: { kind: 'jest-report', mode: 'json', outputFile },
      }),
    );

    expect(result.body.passed).toBe(false);
    expect(result.body.daemonError).toBe(true);
    expect(result.isError).toBe(true);
  });
});
