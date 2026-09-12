import {
  up,
  down,
} from '../../../migrations/20260911_120000_require_league_scoring_profile';

describe('Migration — require every league to have a default scoring profile', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates the auto-heal function, deferred constraint trigger, and backfills gaps', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
    await up({ db: mockDb as any });

    const sql = executedStatements.join('\n');
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.ensure_league_has_default_scoring_profile()',
    );
    expect(sql).toContain('WHERE league_id = NEW.id AND is_default = true');
    expect(sql).toContain(
      'INSERT INTO public.league_scoring_profiles (league_id, profile_name, status, is_default)',
    );
    expect(sql).toContain("VALUES (NEW.id, 'Default', 'active', true);");
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS leagues_require_scoring_profile_trigger ON public.leagues;',
    );
    expect(sql).toContain(
      'CREATE CONSTRAINT TRIGGER leagues_require_scoring_profile_trigger',
    );
    expect(sql).toContain('AFTER INSERT ON public.leagues');
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain(
      'FOR EACH ROW EXECUTE FUNCTION public.ensure_league_has_default_scoring_profile();',
    );
    // Backfill query for pre-existing leagues missing a default profile.
    expect(sql).toContain('WHERE NOT EXISTS (');
    expect(sql).toContain('WHERE p.league_id = l.id AND p.is_default = true');
  });

  it('down drops the trigger and the function', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
    await down({ db: mockDb as any });

    const sql = executedStatements.join('\n');
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS leagues_require_scoring_profile_trigger ON public.leagues;',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.ensure_league_has_default_scoring_profile();',
    );
  });
});
