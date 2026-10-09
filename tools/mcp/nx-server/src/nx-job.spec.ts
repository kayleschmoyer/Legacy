import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resolve } from 'node:path';

import {
  binJobSpec,
  nxJobSpec,
  pnpmJobSpec,
  PREFLIGHT_TIMEOUT_MS,
  remainingSyncBudgetMs,
  SYNC_BUDGET_MS,
} from './nx-job.js';

const ROOT = resolve('/repo');

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

describe('nx-job', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('pnpmJobSpec / nxJobSpec', () => {
    it('runs pnpm directly without a shell on POSIX', () => {
      setPlatform('linux');

      expect(pnpmJobSpec(['exec', 'eslint', 'a.ts'])).toEqual({
        command: 'pnpm',
        args: ['exec', 'eslint', 'a.ts'],
        shell: false,
      });
    });

    it('wraps nx args in "pnpm exec nx"', () => {
      setPlatform('linux');

      expect(nxJobSpec(['run', 'web:build'])).toEqual({
        command: 'pnpm',
        args: ['exec', 'nx', 'run', 'web:build'],
        shell: false,
      });
    });

    it('runs pnpm through cmd.exe with escaped args on Windows', () => {
      setPlatform('win32');

      expect(pnpmJobSpec(['exec', 'eslint', 'a b.ts'])).toEqual({
        command: 'pnpm',
        args: ['exec', 'eslint', '"a b.ts"'],
        shell: true,
      });
    });
  });

  // LS-10021: `pnpm exec` re-roots its own cwd to the nearest ancestor
  // package.json, silently jumping to the workspace root for a project
  // directory (like apps/web-e2e) that has no package.json of its own —
  // binJobSpec sidesteps that entirely by invoking the resolved
  // `.bin` shim directly, so the caller's `cwd` spawn option is what
  // actually governs where the binary runs.
  describe('binJobSpec', () => {
    beforeEach(() => {
      setPlatform('linux');
    });

    it('resolves the binary directly from node_modules/.bin, not via pnpm exec', () => {
      const spec = binJobSpec(ROOT, 'eslint', ['--max-warnings=0', 'a.ts']);

      expect(spec).toEqual({
        command: resolve(ROOT, 'node_modules', '.bin', 'eslint'),
        args: ['--max-warnings=0', 'a.ts'],
        shell: false,
      });
    });

    it('resolves the binary relative to the given repoRoot, not the process cwd', () => {
      const other = resolve('/worktree');

      const spec = binJobSpec(other, 'eslint', ['a.ts']);

      expect(spec.command).toBe(
        resolve(other, 'node_modules', '.bin', 'eslint'),
      );
    });

    it('uses the .cmd shim through cmd.exe with escaped args on Windows', () => {
      setPlatform('win32');

      const spec = binJobSpec(ROOT, 'eslint', ['a b.ts']);

      expect(spec).toEqual({
        command: resolve(ROOT, 'node_modules', '.bin', 'eslint.cmd'),
        args: ['"a b.ts"'],
        shell: true,
      });
    });
  });

  describe('remainingSyncBudgetMs (LS-10174)', () => {
    it('gives the full budget when no time has been spent', () => {
      expect(remainingSyncBudgetMs(1_000, 1_000)).toBe(SYNC_BUDGET_MS);
    });

    it('deducts time already spent on pre-flight work', () => {
      expect(remainingSyncBudgetMs(0, 12_000)).toBe(SYNC_BUDGET_MS - 12_000);
    });

    it('never exceeds the budget on clock skew', () => {
      expect(remainingSyncBudgetMs(5_000, 1_000)).toBe(SYNC_BUDGET_MS);
    });

    it('keeps a floor so the job still gets a real wait', () => {
      expect(remainingSyncBudgetMs(0, SYNC_BUDGET_MS * 2)).toBe(5_000);
    });

    it('keeps pre-flight cap + remaining job wait within the single-call budget', () => {
      expect(
        PREFLIGHT_TIMEOUT_MS + remainingSyncBudgetMs(0, PREFLIGHT_TIMEOUT_MS),
      ).toBeLessThanOrEqual(SYNC_BUDGET_MS);
    });
  });
});
