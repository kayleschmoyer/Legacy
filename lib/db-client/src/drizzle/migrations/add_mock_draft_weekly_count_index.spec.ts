import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import {
  up,
  down,
} from '../../../migrations/20260601_000000_add_mock_draft_weekly_count_index';

describe('Migration — add partial index for mock draft weekly count query', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates the partial index on leagues(owner, created_at) where is_mock_draft = true', async () => {
    const statements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        statements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    expect(statements).toHaveLength(1);
    const sql = statements[0];
    expect(sql).toContain('idx_leagues_owner_created_at_mock');
    expect(sql).toContain('leagues');
    expect(sql).toContain('owner');
    expect(sql).toContain('created_at');
    expect(sql).toContain('is_mock_draft = true');
  });

  it('down drops the partial index', async () => {
    const statements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        statements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<NodePgQueryResultHKT> });
    expect(statements).toHaveLength(1);
    const sql = statements[0];
    expect(sql).toContain('DROP INDEX');
    expect(sql).toContain('idx_leagues_owner_created_at_mock');
  });
});
