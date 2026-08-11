import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  makeRunStatus,
  makeRunWait,
  startMakeInBackground,
} from './make-run-bg.js';

/** Pull the parsed JSON payload out of a ToolResult's text content. */
function payload(result: {
  content: Array<{ text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('makeRunStatus / makeRunWait — unknown job', () => {
  it('makeRunStatus returns an error for an unknown jobId', () => {
    const result = makeRunStatus({ jobId: 'does-not-exist' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('makeRunWait returns an error for an unknown jobId', async () => {
    const result = await makeRunWait({ jobId: 'does-not-exist' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});

describe('background execution lifecycle', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-bg-test-'));
    // Makefile recipes require a leading TAB. Use `echo` (not `true`): when these
    // tests run as a descendant of `make pc` on Windows, the child make finds no
    // sh.exe in PATH and execs simple commands directly via CreateProcess — `true`
    // is not a Windows executable and fails with e=2, while `echo` routes through
    // the cmd.exe fallback shell and works under both sh and cmd.
    writeFileSync(join(workDir, 'Makefile'), 'noop:\n\t@echo ok\n');
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('startMakeInBackground returns a jobId immediately', () => {
    const { jobId, logPath } = startMakeInBackground(
      ['noop'],
      'noop',
      workDir,
      30_000,
    );
    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);
    expect(logPath).toContain('make-run-jobs');

    // Status is queryable right away and reports one of the valid states.
    const status = payload(makeRunStatus({ jobId }));
    expect(['running', 'done', 'failed']).toContain(status.status);
  });

  it('makeRunWait resolves to done/success for a passing target', async () => {
    const { jobId } = startMakeInBackground(['noop'], 'noop', workDir, 30_000);
    const result = await makeRunWait({ jobId });
    const body = payload(result);
    expect(body.status).toBe('done');
    expect(body.success).toBe(true);
    expect(result.isError).toBeFalsy();
  }, 20_000);

  it('makeRunWait reports failure for a non-existent target', async () => {
    const { jobId } = startMakeInBackground(
      ['__no_such_target__'],
      '__no_such_target__',
      workDir,
      30_000,
    );
    const result = await makeRunWait({ jobId });
    const body = payload(result);
    expect(body.status).toBe('failed');
    expect(body.success).toBe(false);
    expect(result.isError).toBe(true);
  }, 20_000);
});
