import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// run-command.ts uses import.meta.url which is incompatible with the commonjs
// tsconfig used by Jest. Mock it here the same way validate-pr.spec.ts does.
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/tmp/fake-repo-root'),
}));

import { runTarget } from './run-target.js';
import { makeRunWait } from './make-run-bg.js';

/** Pull the parsed JSON payload out of a ToolResult's text content. */
function payload(result: {
  content: Array<{ text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe('runTarget — allowlist gate', () => {
  it('rejects an unlisted target', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not in the allowed target list');
  });
});

describe('runTarget — variable injection guard', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-rt-test-'));
    writeFileSync(join(workDir, 'Makefile'), 'kill-stale:\n\t@echo ok\n');
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('rejects variables containing shell metacharacters', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      variables: 'FOO=$(evil)',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid variable format');
  });
});

describe('runTarget — runInBackground: true', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-rt-bg-test-'));
    writeFileSync(join(workDir, 'Makefile'), 'kill-stale:\n\t@echo ok\n');
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  // Background mode calls startMakeInBackground (real make process), not runMake.
  it('returns status: running and a jobId immediately', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      runInBackground: true,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.status).toBe('running');
    expect(typeof body.jobId).toBe('string');
    expect((body.jobId as string).length).toBeGreaterThan(0);
    expect(body.target).toBe('kill-stale');
  });

  it('job resolves to done/success when polled with makeRunWait', async () => {
    const startResult = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      runInBackground: true,
    });
    const { jobId } = payload(startResult) as { jobId: string };
    const waitResult = await makeRunWait({ jobId });
    const body = payload(waitResult);
    expect(body.status).toBe('done');
    expect(body.success).toBe(true);
    expect(waitResult.isError).toBeFalsy();
  }, 20_000);

  it('job resolves to failed when the target does not exist in the Makefile', async () => {
    const startResult = await runTarget({
      target: 'diagnose',
      worktreePath: workDir,
      runInBackground: true,
    });
    // diagnose is in ALLOWED_TARGETS but not in our minimal test Makefile
    const { jobId } = payload(startResult) as { jobId: string };
    const waitResult = await makeRunWait({ jobId });
    const body = payload(waitResult);
    expect(body.status).toBe('failed');
    expect(body.success).toBe(false);
    expect(waitResult.isError).toBe(true);
  }, 20_000);
});

describe('runTarget — default path (budgeted background job)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-rt-default-test-'));
    writeFileSync(
      join(workDir, 'Makefile'),
      'kill-stale:\n\t@echo ok\n' +
        // diagnose sleeps ~1.5s via node so the 500ms process timeout fires.
        'diagnose:\n\t@node -e "setTimeout(function(){}, 1500)"\n',
    );
  });

  afterAll(async () => {
    // The killed job's node grandchild survives child.kill() (make-only kill —
    // the tree-kill gap tracked in LS-8564) and holds workDir open on Windows.
    // Outwait it, then retry the removal to absorb any EBUSY tail.
    await new Promise((r) => setTimeout(r, 2_000));
    rmSync(workDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
  }, 15_000);

  it('fast target completes within the sync budget and returns done/success', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.status).toBe('done');
    expect(body.success).toBe(true);
    expect(typeof body.jobId).toBe('string');
    expect(body.target).toBe('kill-stale');
  }, 20_000);

  it('returns timedOut: true when the process timeout kills the target', async () => {
    const result = await runTarget({
      target: 'diagnose',
      worktreePath: workDir,
      timeoutMs: 500,
    });
    expect(result.isError).toBe(true);
    const body = payload(result);
    expect(body.timedOut).toBe(true);
    expect(body.success).toBe(false);
    expect(body.target).toBe('diagnose');
    expect(body.timeoutMs).toBe(500);
  }, 20_000);
});
