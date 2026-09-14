import { describe, expect, it } from '@jest/globals';

import {
  buildRunOnRefScript,
  RUN_ON_REF_CLEANED_UP_MARKER,
  RUN_ON_REF_CLEANUP_FAILED_MARKER,
  shellSingleQuote,
} from './run-on-ref-script';

describe('shellSingleQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellSingleQuote('/tmp/foo')).toBe("'/tmp/foo'");
  });

  it('escapes an embedded single quote', () => {
    expect(shellSingleQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe('buildRunOnRefScript (posix)', () => {
  const opts = {
    tmpWorktreePath: '/tmp/legacy-sports-ref-check-1',
    mainRepo: '/main',
    command: 'pnpm exec tsc --noEmit',
  };

  it('cds into the throwaway worktree and runs the command', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain(
      `cd '/tmp/legacy-sports-ref-check-1' && pnpm exec tsc --noEmit`,
    );
  });

  it('traps EXIT so cleanup runs on success, failure, or a kill signal', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain('trap cleanup EXIT');
  });

  it('removes the worktree via git worktree remove --force first', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain(
      `git worktree remove --force '/tmp/legacy-sports-ref-check-1'`,
    );
  });

  it('falls back to rm -rf + git worktree prune', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain(`rm -rf '/tmp/legacy-sports-ref-check-1'`);
    expect(script).toContain('git worktree prune');
  });

  it('echoes the cleaned-up marker on the success path and the failed marker on the fallback-failure path', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain(RUN_ON_REF_CLEANED_UP_MARKER);
    expect(script).toContain(RUN_ON_REF_CLEANUP_FAILED_MARKER);
  });

  it('cds into mainRepo before attempting cleanup, since the worktree itself may be gone', () => {
    const script = buildRunOnRefScript(opts);
    expect(script.indexOf(`cd '/main'`)).toBeGreaterThanOrEqual(0);
  });

  it('single-quotes a path containing an apostrophe', () => {
    const script = buildRunOnRefScript({
      ...opts,
      mainRepo: "/home/o'brien/legacy-sports",
    });
    expect(script).toContain(`'/home/o'\\''brien/legacy-sports'`);
  });
});

describe('buildRunOnRefScript (cmd.exe fallback)', () => {
  const opts = {
    tmpWorktreePath: 'C:\\tmp\\ref-check-1',
    mainRepo: 'C:\\repo',
    command: 'pnpm exec tsc --noEmit',
    isCmdShell: true,
  };

  it('does not use trap (unsupported in cmd.exe)', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).not.toContain('trap');
  });

  it('still runs the command and attempts cleanup afterward', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain('pnpm exec tsc --noEmit');
    expect(script).toContain('git worktree remove --force');
    expect(script).toContain(RUN_ON_REF_CLEANED_UP_MARKER);
  });

  it('preserves the command exit code via ERRORLEVEL', () => {
    const script = buildRunOnRefScript(opts);
    expect(script).toContain('set RC=%ERRORLEVEL%');
    expect(script).toContain('exit /b %RC%');
  });
});
