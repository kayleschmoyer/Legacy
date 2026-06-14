import { describe, expect, it, jest } from '@jest/globals';

// run-command.js uses `import.meta.url`, which the CommonJS test transform
// cannot compile. parseUpOutput is a pure string parser that never touches it,
// so stub the module to keep it out of the require graph.
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(),
  runTsx: jest.fn(),
}));

import { parseUpOutput } from './migrate.js';

// LOGGER prefixes every line with `[<iso>] INFO: ` — reproduce that shape so
// the parser is exercised against realistic runner output.
const log = (msg: string) => `[2026-06-13T21:00:00.000Z] INFO: ${msg}`;

describe('parseUpOutput', () => {
  it('counts only newly-applied migrations, not skipped ones (LS-8008)', () => {
    // A run that applies ONE new migration after skipping two already-applied
    // ones. The bug counted all three because "Already applied: <file>"
    // contains the substring "applied: <file>".
    const output = [
      log('🔧 Legacy Sports Rollback Migration (UP)'),
      log('📁 Found 3 migration files'),
      log('📊 2 migrations already applied'),
      log('⏭️ Already applied: 20260101_000000_first.ts'),
      log('⏭️ Already applied: 20260102_000000_second.ts'),
      log('⬆️ Applying migration: 20260103_000000_third.ts'),
      log('✅ Applied: 20260103_000000_third.ts'),
      log('✅ Applied 1 new migrations'),
    ].join('\n');

    expect(parseUpOutput(output)).toEqual({
      applied: 1,
      appliedNames: ['20260103_000000_third.ts'],
      success: true,
    });
  });

  it('reports zero applied for a no-op run with only skipped migrations', () => {
    // The exact scenario that produced the misleading `applied: 236`: every
    // file already applied, nothing new. Must report 0, not the journal size.
    const output = [
      log('📁 Found 3 migration files'),
      log('⏭️ Already applied: 20260101_000000_first.ts'),
      log('⏭️ Already applied: 20260102_000000_second.ts'),
      log('⏭️ Already applied: 20260103_000000_third.ts'),
      log('📋 No new migrations to apply'),
    ].join('\n');

    expect(parseUpOutput(output)).toEqual({
      applied: 0,
      appliedNames: [],
      success: true,
    });
  });

  it('deduplicates the "Applying migration:" and "Applied:" pair for one file', () => {
    const output = [
      log('⬆️ Applying migration: 20260104_000000_fourth.ts'),
      log('✅ Applied: 20260104_000000_fourth.ts'),
    ].join('\n');

    expect(parseUpOutput(output)).toEqual({
      applied: 1,
      appliedNames: ['20260104_000000_fourth.ts'],
      success: true,
    });
  });

  it('counts multiple distinct newly-applied migrations', () => {
    const output = [
      log('⏭️ Already applied: 20260101_000000_first.ts'),
      log('✅ Applied: 20260105_000000_fifth.ts'),
      log('✅ Applied: 20260106_000000_sixth.ts'),
      log('✅ Applied 2 new migrations'),
    ].join('\n');

    const result = parseUpOutput(output);
    expect(result.applied).toBe(2);
    expect(result.appliedNames).toEqual([
      '20260105_000000_fifth.ts',
      '20260106_000000_sixth.ts',
    ]);
  });

  it('returns an empty result for output with no migration lines', () => {
    expect(parseUpOutput('nothing relevant here\nstill nothing')).toEqual({
      applied: 0,
      appliedNames: [],
      success: true,
    });
  });
});
