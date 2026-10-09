import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('runTarget — allowlist gate', () => {
  it('rejects an unlisted target', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not in the allowed target list');
  });

  it('allows the review-skill lint targets (LS-8565)', async () => {
    // The refusal message enumerates the allowlist — assert the read-only
    // self-review targets are on it without launching a real make process.
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('lint-review-patterns');
    expect(result.content[0].text).toContain('lint-touch-map');
  });

  it('allows the audit-session CCR gap-audit fallback (LS-10152)', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('audit-session');
  });

  it('allows the drift-check lint targets (LS-8549)', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('lint-skill-index');
    expect(result.content[0].text).toContain('lint-agent-prompts');
  });

  it('allows the generated-file resync targets (LS-9027)', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('sync-skill-index');
    expect(result.content[0].text).toContain('sync-agent-prompts');
  });

  it('allows the lockfile target (LS-10028)', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('lockfile');
  });

  it('allows the node:test suite targets (LS-10358)', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    expect(result.content[0].text).toContain('test-github-scripts');
    expect(result.content[0].text).toContain('test-root-scripts');
  });

  it('allows the LS-10152 AC3 recurrence-guard cleanup targets', async () => {
    const result = await runTarget({ target: '__not_a_real_target__' });
    for (const target of [
      'check-skipped-tests',
      'ci-classify-failure',
      'dev-env-health',
      'diagrams',
      'e2e-scope',
      'hash-design-bundle',
      'help',
      'lint-animated-theme-vars',
      'lint-eslint-tsconfig-anchored',
      'lint-theme-compliance',
      'scaffold-story',
      'scan-secret',
    ]) {
      expect(result.content[0].text).toContain(target);
    }
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

describe('runTarget — maxWorkers (LS-8666)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-rt-maxworkers-test-'));
    writeFileSync(
      join(workDir, 'Makefile'),
      'kill-stale:\n\t@echo "MAXWORKERS=$(MAXWORKERS)"\n',
    );
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('rejects a non-positive maxWorkers', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      maxWorkers: 0,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });

  it('rejects a non-integer maxWorkers', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      maxWorkers: 1.5,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });

  it('forwards maxWorkers as a MAXWORKERS make variable', async () => {
    const result = await runTarget({
      target: 'kill-stale',
      worktreePath: workDir,
      maxWorkers: 2,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.output).toContain('MAXWORKERS=2');
  }, 20_000);
});

describe('runTarget — runInBackground: true', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'make-rt-bg-test-'));
    writeFileSync(join(workDir, 'Makefile'), 'kill-stale:\n\t@echo ok\n');
  });

  afterAll(async () => {
    // format/codegen jobs (LS-7903) spawn real make processes for undefined
    // targets; the job runner's tree-kill (taskkill /T on Windows) fires
    // asynchronously, so the node grandchild can briefly outlive the job and
    // hold workDir open. Outwait it, then retry the removal to absorb any
    // EBUSY tail — same pattern as the "default path" describe block below.
    await new Promise((r) => setTimeout(r, 2_000));
    rmSync(workDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
  }, 15_000);

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

  it('uses the 600000ms heavy-target default timeout for format (LS-7903)', async () => {
    const result = await runTarget({
      target: 'format',
      worktreePath: workDir,
      runInBackground: true,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.status).toBe('running');
    expect(body.timeoutMs).toBe(600_000);
  });

  it('uses the 600000ms heavy-target default timeout for codegen (LS-7903)', async () => {
    const result = await runTarget({
      target: 'codegen',
      worktreePath: workDir,
      runInBackground: true,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.status).toBe('running');
    expect(body.timeoutMs).toBe(600_000);
  });

  it('uses the default 300000ms timeout for lockfile (LS-10028)', async () => {
    const result = await runTarget({
      target: 'lockfile',
      worktreePath: workDir,
      runInBackground: true,
    });
    expect(result.isError).toBeFalsy();
    const body = payload(result);
    expect(body.status).toBe('running');
    expect(body.timeoutMs).toBe(300_000);
  });

  it.each(['build-all', 'test-all', 'install', 'install-force'])(
    'uses the 1800000ms very-heavy-target default timeout for %s (LS-8354)',
    async (target) => {
      const result = await runTarget({
        target,
        worktreePath: workDir,
        runInBackground: true,
      });
      expect(result.isError).toBeFalsy();
      const body = payload(result);
      expect(body.status).toBe('running');
      expect(body.timeoutMs).toBe(1_800_000);
    },
  );
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
    // The job runner's tree-kill (taskkill /T on Windows) is fired
    // asynchronously, so the node grandchild can briefly outlive the job and
    // hold workDir open. Outwait it, then retry the removal to absorb any
    // EBUSY tail.
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
