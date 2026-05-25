import {
  up,
  down,
} from '../../../migrations/20260524_000000_add_defensive_format_to_leagues';

describe('Migration — add defensive_format to leagues', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up adds defensive_format column with CHECK constraint', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await up({ db: mockDb as any });
    expect(executedStatements.length).toBeGreaterThan(0);
    const sql = executedStatements[0];
    expect(sql).toContain('defensive_format');
    expect(sql).toContain("IN ('dst', 'idp')");
    expect(sql).toContain('NOT NULL');
    expect(sql).toContain("DEFAULT 'dst'");
  });

  it('down drops defensive_format column', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await down({ db: mockDb as any });
    expect(executedStatements.length).toBeGreaterThan(0);
    const sql = executedStatements[0];
    expect(sql).toContain('DROP COLUMN');
    expect(sql).toContain('defensive_format');
  });
});
