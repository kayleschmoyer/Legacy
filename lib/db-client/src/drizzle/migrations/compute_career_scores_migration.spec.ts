import {
  up,
  down,
} from '../../../migrations/20260221_010000_add_compute_career_scores_function';

describe('Migration — compute_career_scores function', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates the function', async () => {
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
    expect(executedStatements[0]).toContain('compute_career_scores');
  });

  it('down drops the function', async () => {
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
    expect(executedStatements[0]).toContain('DROP FUNCTION');
  });
});
