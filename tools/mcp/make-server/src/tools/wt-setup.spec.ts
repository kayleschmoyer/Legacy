import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  makeRunStatus,
  makeRunWait,
  startCommandInBackground,
} from './make-run-bg.js';
import {
  buildRemainingPhasesHint,
  buildRunningHint,
  buildTimeoutHint,
  SLOT_HEALTH_HINT,
  WT_SETUP_DEFAULT_TIMEOUT_MS,
  wtSetup,
} from './wt-setup.js';

/** Pull the parsed JSON payload out of a ToolResult's text content. */
function payload(result: {
  content: Array<{ text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('wt-setup hints (LS-10087)', () => {
  it('names link.mjs --check in the slot-health hint', () => {
    expect(SLOT_HEALTH_HINT).toContain(
      'node scripts/modules-pool/link.mjs --check',
    );
    expect(SLOT_HEALTH_HINT).toContain('half-materialized');
    expect(SLOT_HEALTH_HINT).toContain('not toolchain corruption');
  });

  it('running hint says the work is still in flight and names the poll tool', () => {
    const hint = buildRunningHint('make-123-abc', 'make wt-setup');
    expect(hint).toContain('still in flight');
    expect(hint).toContain('has NOT been abandoned');
    expect(hint).toContain('make_run_wait({ jobId: "make-123-abc" })');
    expect(hint).toContain('Do NOT re-run make_wt_setup');
    expect(hint).toContain('link.mjs --check');
  });

  it('timeout hint points at a larger timeoutMs, not at a broken repo', () => {
    const hint = buildTimeoutHint('make install', 300_000);
    expect(hint).toContain('300000ms');
    expect(hint).toContain('larger timeoutMs');
    expect(hint).toContain('link.mjs --check');
  });

  it('remaining-phases hint tells the caller to re-invoke after the job finishes', () => {
    const hint = buildRemainingPhasesHint(['make install']);
    expect(hint).toContain('make install');
    expect(hint).toContain('re-invoke make_wt_setup');
    expect(hint).toContain('idempotent');
  });

  it('defaults to the 30-minute install budget, not the old 300s cap', () => {
    expect(WT_SETUP_DEFAULT_TIMEOUT_MS).toBe(1_800_000);
    expect(WT_SETUP_DEFAULT_TIMEOUT_MS).toBeGreaterThan(300_000);
  });
});

describe('wtSetup platform guard', () => {
  it('returns a non-Windows error off win32', async () => {
    if (process.platform === 'win32') return;
    const result = await wtSetup({ worktreePath: 'C:/nope' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Windows-only');
  });
});

describe('startCommandInBackground — jobs are pollable with make_run_* (LS-10087)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'wt-setup-test-'));
    // Makefile recipes require a leading TAB. `echo` (not `true`) so the job
    // works under both sh and the cmd.exe fallback shell on Windows.
    writeFileSync(join(workDir, 'Makefile'), 'noop:\n\t@echo ok\n');
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('starts a non-make command and exposes it to make_run_status', async () => {
    const { jobId, logPath } = startCommandInBackground({
      command: 'make',
      args: ['noop'],
      label: 'make wt-setup',
      target: 'make wt-setup',
      workDir,
      timeoutMs: 30_000,
      shell: process.platform === 'win32',
    });
    expect(typeof jobId).toBe('string');
    // Same namespaced runner as make_run — that is what makes the job pollable
    // with the existing make_run_status / make_run_wait tools.
    expect(logPath).toContain('make-run-jobs');

    const waited = await makeRunWait({ jobId, maxWaitMs: 30_000 });
    const waitedBody = payload(waited);
    expect(waitedBody.jobId).toBe(jobId);
    expect(waitedBody.target).toBe('make wt-setup');
    expect(waitedBody.status).toBe('done');

    const snapshot = payload(makeRunStatus({ jobId }));
    expect(snapshot.jobId).toBe(jobId);
    expect(snapshot.success).toBe(true);
  }, 40_000);
});
