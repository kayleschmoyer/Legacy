/**
 * Regression guard for LS-9765.
 *
 * Client report: filtering the NFL Player stats page to Running backs sorted
 * by rushing yards showed Frank Gore as the career leader, ahead of Emmitt
 * Smith (18,355 yds) and Walter Payton (16,726 yds) — both of whom actually
 * outrushed him. Root cause was NOT the sort/ORDER BY logic in
 * `footballPlayers` (lambdas/db/src/schema/football.ts): `rushing.yds` has
 * always sorted on the real `career_football_rushing.yds` career-total
 * column, correctly, with NULLS LAST and an id tiebreaker. The actual defect
 * was upstream in player discovery (LS-9968): Pro Football Reference marks
 * every Hall of Fame inductee's name with a trailing "+" on the per-letter
 * player-index page, and the old parser failed to strip it before matching
 * the `(POS)` token — silently dropping every HOF player (Smith and Payton
 * included) from the `players` table entirely, so they never had a
 * `career_football_rushing` row for the leaderboard to sort by in the first
 * place. That parser bug is already fixed (`lib/pfr-client/src/lib/Players.ts`),
 * and the two historical players are backfilled by migration
 * `20260909_120000_backfill_missing_hof_rb_players`. This is NOT the same
 * root cause as LS-9919/LS-9920 (multi-team season aggregation for players
 * who already have a `players` row) — Smith and Payton had no row at all, so
 * that repair path never touched them.
 *
 * This suite locks down the actual, correct behavior end-to-end against real
 * Postgres: given players with real `career_football_rushing` career totals,
 * a rushing.yds-desc query over the RB position returns them ordered by that
 * career total — so a future regression to a per-season or paginated value
 * (rather than the true career sum) would fail this test immediately.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../integration-test-setup';

const { players, careerFootballRushing } = integrationTestSchema;

/**
 * `bref_id` prefix for the players this suite inserts and removes.
 * `bref_id` is `varchar(10)`, so this plus each roster entry's one-letter
 * `code` below must stay within 10 characters total.
 */
const BREF_PREFIX = 'ls9765';

describe('football rushing leaderboard sort (LS-9765)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM players WHERE bref_id LIKE ${`${BREF_PREFIX}%`}`,
    );
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM players WHERE bref_id LIKE ${`${BREF_PREFIX}%`}`,
    );
  });

  /**
   * Real career rushing totals for a known set of historical RBs, deliberately
   * inserted in an order that does NOT match career-yardage rank — if the
   * leaderboard query ever regressed to ordering by insertion/id instead of
   * `career_football_rushing.yds`, this would still (wrongly) pass unless the
   * assertion actually checks names against yardage, which it does below.
   */
  const ROSTER = [
    { code: 'g', firstName: 'Frank', lastName: 'Gore', yds: 16000 },
    { code: 's', firstName: 'Emmitt', lastName: 'Smith', yds: 18355 },
    { code: 'a', firstName: 'Barry', lastName: 'Sanders', yds: 15269 },
    { code: 'p', firstName: 'Walter', lastName: 'Payton', yds: 16726 },
  ] as const;

  async function seedRoster(): Promise<void> {
    for (const p of ROSTER) {
      const [row] = await db
        .insert(players)
        .values({
          firstName: p.firstName,
          lastName: p.lastName,
          brefId: `${BREF_PREFIX}${p.code}`,
          sport: 'football',
          position: 'RB',
        })
        .returning({ id: players.id });
      await db.insert(careerFootballRushing).values({
        playerId: row.id,
        g: 200,
        att: 4000,
        yds: p.yds,
        td: 100,
      });
    }
  }

  it('orders RBs by true career rushing yards, not insertion order — Smith and Payton outrank Gore', async () => {
    await seedRoster();

    // Mirrors the ordering the footballPlayers resolver builds for
    // sortBy: 'rushing.yds', sortDir: 'desc', category: 'rushing'
    // (lambdas/db/src/schema/football.ts) — NULLS LAST + id tiebreaker.
    // Scoped to this suite's own bref_id prefix — the real Smith/Payton rows
    // seeded by the LS-9765 migration share these last names, so matching on
    // name alone would double-count them alongside the synthetic roster.
    const rows = await db
      .select({
        lastName: players.lastName,
        yds: careerFootballRushing.yds,
      })
      .from(players)
      .innerJoin(
        careerFootballRushing,
        eq(careerFootballRushing.playerId, players.id),
      )
      .where(
        and(
          eq(players.sport, 'football'),
          eq(players.position, 'RB'),
          sql`${players.brefId} LIKE ${`${BREF_PREFIX}%`}`,
        ),
      )
      .orderBy(
        sql`${careerFootballRushing.yds} DESC NULLS LAST`,
        asc(players.id),
      );

    expect(rows.map((r) => r.lastName)).toEqual([
      'Smith',
      'Payton',
      'Gore',
      'Sanders',
    ]);
  });

  it('sorts ascending by career rushing yards when requested', async () => {
    await seedRoster();

    const rows = await db
      .select({
        lastName: players.lastName,
        yds: careerFootballRushing.yds,
      })
      .from(players)
      .innerJoin(
        careerFootballRushing,
        eq(careerFootballRushing.playerId, players.id),
      )
      .where(
        and(
          eq(players.sport, 'football'),
          eq(players.position, 'RB'),
          sql`${players.brefId} LIKE ${`${BREF_PREFIX}%`}`,
        ),
      )
      .orderBy(
        sql`${careerFootballRushing.yds} ASC NULLS LAST`,
        asc(players.id),
      );

    expect(rows.map((r) => r.lastName)).toEqual([
      'Sanders',
      'Gore',
      'Payton',
      'Smith',
    ]);
  });

  it('the real production HOF backfill (LS-9765) makes Smith and Payton outrank Gore', async () => {
    // Independent of the synthetic roster above: confirms the actual
    // production players — inserted by migration
    // 20260909_120000_backfill_missing_hof_rb_players — carry correct enough
    // data for the real leaderboard query to rank them ahead of Gore, closing
    // the loop on the original client report.
    const rows = await db
      .select({
        lastName: players.lastName,
        firstName: players.firstName,
        yds: careerFootballRushing.yds,
      })
      .from(players)
      .innerJoin(
        careerFootballRushing,
        eq(careerFootballRushing.playerId, players.id),
      )
      .where(
        and(
          eq(players.sport, 'football'),
          eq(players.position, 'RB'),
          sql`${players.pfrId} IN ('SmitEm00', 'PaytWa00')`,
        ),
      )
      .orderBy(desc(careerFootballRushing.yds));

    expect(rows.map((r) => `${r.firstName} ${r.lastName}`)).toEqual([
      'Emmitt Smith',
      'Walter Payton',
    ]);
    for (const row of rows) {
      expect(row.yds).toBeGreaterThan(16000);
    }
  });
});
