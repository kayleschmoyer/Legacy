import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260524_000200_add_position_to_players_and_create_football_view';

describe('Migration — add players.position + football_player_eligible_positions view (LS-250)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds players.position column and creates the football_player_eligible_positions view', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    // 1 ALTER TABLE (add position) + 1 CREATE OR REPLACE VIEW
    expect(executedStatements).toHaveLength(2);

    expect(executedStatements[0]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(executedStatements[0]).toContain('"position"');
    expect(executedStatements[0]).toContain('player_position');

    const viewSql = executedStatements[1];
    expect(viewSql).toContain('CREATE OR REPLACE VIEW');
    expect(viewSql).toContain('football_player_eligible_positions');

    // DST branch
    expect(viewSql).toContain('is_dst = true');
    expect(viewSql).toContain("'DST'");

    // IDP branch
    expect(viewSql).toContain("'DL', 'LB', 'DB'");

    // Offensive branch
    expect(viewSql).toContain("'QB', 'RB', 'WR', 'TE', 'K'");

    // QB stat-inferred fallback
    expect(viewSql).toContain('career_football_passing');
    expect(viewSql).toContain('cfp.att > 0');
    expect(viewSql).toContain('p.position IS NULL');

    // K stat-inferred fallback with NOT EXISTS guard
    expect(viewSql).toContain('career_football_kicking');
    expect(viewSql).toContain('cfk.fga > 0');
    expect(viewSql).toContain('NOT EXISTS');
  });

  it('down drops the view and removes players.position column', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    // DROP VIEW + ALTER TABLE DROP COLUMN
    expect(executedStatements).toHaveLength(2);

    expect(executedStatements[0]).toContain('DROP VIEW IF EXISTS');
    expect(executedStatements[0]).toContain(
      'football_player_eligible_positions',
    );

    expect(executedStatements[1]).toContain('DROP COLUMN IF EXISTS');
    expect(executedStatements[1]).toContain('"position"');
  });
});
