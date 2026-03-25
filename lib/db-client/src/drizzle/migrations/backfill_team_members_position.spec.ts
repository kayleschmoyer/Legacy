import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260325_120000_backfill_team_members_position_from_matchup_players';

describe('Migration — backfill team_members.positionId from matchup_players (LS-1767)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up executes the backfill UPDATE with correct SQL', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });
    expect(executedStatements).toHaveLength(1);

    const sql = executedStatements[0];
    // Verify the CTE pulls from matchup_players with position_id IS NOT NULL
    expect(sql).toContain('matchup_players');
    expect(sql).toContain('mp.position_id IS NOT NULL');

    // Verify it updates team_members where position_id IS NULL
    expect(sql).toContain('UPDATE public.team_members');
    expect(sql).toContain('tm.position_id IS NULL');

    // Verify it respects the unique constraint
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('tm2.position_id = lmp.position_id');
  });

  it('down is a no-op (executes SELECT 1)', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({
      db: mockDb as unknown as PgDatabase<any>,
    });
    // down is intentionally a no-op — only a SELECT 1 placeholder
    expect(executedStatements).toHaveLength(1);
    expect(executedStatements[0]).toContain('SELECT 1');
    expect(executedStatements[0]).toContain('no-op');
  });
});
