import {
  up,
  down,
} from '../../../migrations/20261005_120000_draft_seats_replace_team_ids';

/**
 * Migration test for LS-10080: auction writers stop writing team ids.
 *
 * Statement-level assertions on the generated SQL. The migration must stay
 * additive: deployed lambdas from before LS-10080 still run against it.
 */
describe('Migration — auction writers stop writing team ids (LS-10080)', () => {
  const capture = async (fn: typeof up): Promise<string[]> => {
    const statements: string[] = [];
    await fn({
      db: {
        execute: (query: string) => {
          statements.push(query);
          return Promise.resolve();
        },
      },
    });
    return statements;
  };

  it('relaxes the auction team-id columns instead of dropping them', async () => {
    const sql = (await capture(up)).join('\n');
    expect(sql).toContain(
      'ALTER TABLE public.auction_budgets ALTER COLUMN team_id DROP NOT NULL',
    );
    expect(sql).toContain(
      'ALTER TABLE public.auction_state ALTER COLUMN nominator_team_id DROP NOT NULL',
    );
    expect(sql).not.toMatch(/DROP (COLUMN|TABLE)/);
  });

  it('adds the seat-keyed auction_budgets unique constraint idempotently', async () => {
    const sql = (await capture(up)).join('\n');
    expect(sql).toContain("conname = 'auction_budgets_uk_draft_participant'");
    expect(sql).toContain('UNIQUE (draft_id, participant_id)');
  });

  it('down backfills team ids from seats before re-requiring them', async () => {
    const statements = await capture(down);
    const backfill = statements.findIndex((s) =>
      s.includes('SET team_id = p.team_id'),
    );
    const notNull = statements.findIndex((s) =>
      s.includes(
        'ALTER TABLE public.auction_budgets ALTER COLUMN team_id SET NOT NULL',
      ),
    );
    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(notNull).toBeGreaterThan(backfill);
  });
});
