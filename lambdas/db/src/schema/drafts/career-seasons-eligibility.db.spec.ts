/**
 * Min-career-seasons eligibility — DB Integration Tests (LS-10552)
 *
 * `careerSeasonsCondition` moved from a correlated
 * `COUNT(DISTINCT season)` subquery on season_batting to an anti-join on the
 * precomputed `career_batting.seasons` column. These tests pin that the
 * rewrite is semantics-preserving: for every threshold, the new predicate,
 * the batch eligibility filter and the draft ADP window all select exactly
 * the players the legacy season_batting predicate selected — including
 * players with zero AL/NL seasons (no career_batting row at all), players
 * with only non-MLB seasons, and traded players with two stints in a season.
 */

import { type SQL, sql } from 'drizzle-orm';
import {
  careerGamesCondition,
  careerSeasonsCondition,
  filterPlayerIdsByLeagueEligibility,
} from '@legacy-sports/db-client';
import { buildDraftAdpCte } from './draft-adp';
import { getTestDatabase } from '../../../integration-test-setup';

/** The pre-LS-10552 predicate, verbatim, as the equivalence oracle. */
function legacyCareerSeasonsCondition(minCareerSeasons: number): SQL {
  return sql`(
    SELECT COUNT(DISTINCT season) = 0 OR COUNT(DISTINCT season) >= ${minCareerSeasons}
    FROM season_batting
    WHERE player_id = p.id AND lg_id IN ('AL', 'NL')
  )`;
}

// bref_id is varchar(10) and unique; the prefix keeps fixtures recognisable.
const FIXTURES: Array<{
  brefId: string;
  rows: Array<{ season: number; lgId: string; team: string }>;
}> = [
  // No batting rows at all (pure pitcher) — always eligible.
  { brefId: 'tcs_none', rows: [] },
  // Only non-MLB seasons — zero AL/NL seasons, always eligible.
  {
    brefId: 'tcs_minor',
    rows: [
      { season: 1880, lgId: 'NA', team: 'BOS' },
      { season: 1881, lgId: 'AA', team: 'BAL' },
      { season: 1882, lgId: 'FL', team: 'CHI' },
    ],
  },
  // One AL season padded with non-MLB seasons — counts as 1.
  {
    brefId: 'tcs_one',
    rows: [
      { season: 1914, lgId: 'FL', team: 'BRO' },
      { season: 1915, lgId: 'FL', team: 'BRO' },
      { season: 1916, lgId: 'AL', team: 'NYA' },
    ],
  },
  // Two seasons, one split across leagues by a trade — counts as 2, not 3.
  {
    brefId: 'tcs_trade',
    rows: [
      { season: 1990, lgId: 'AL', team: 'OAK' },
      { season: 1991, lgId: 'AL', team: 'OAK' },
      { season: 1991, lgId: 'NL', team: 'SFN' },
    ],
  },
  // Three AL/NL seasons — counts as 3.
  {
    brefId: 'tcs_three',
    rows: [
      { season: 2001, lgId: 'NL', team: 'ATL' },
      { season: 2002, lgId: 'NL', team: 'ATL' },
      { season: 2003, lgId: 'AL', team: 'BOS' },
    ],
  },
];

/** Expected eligible bref ids per threshold, derived by hand from FIXTURES. */
const EXPECTED: Record<number, string[]> = {
  1: ['tcs_minor', 'tcs_none', 'tcs_one', 'tcs_three', 'tcs_trade'],
  2: ['tcs_minor', 'tcs_none', 'tcs_three', 'tcs_trade'],
  3: ['tcs_minor', 'tcs_none', 'tcs_three'],
  4: ['tcs_minor', 'tcs_none'],
};

describe('Min-career-seasons eligibility — DB Integration Tests (LS-10552)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;
  const idsByBref = new Map<string, number>();
  let fixtureIds: number[] = [];

  async function removeFixtures() {
    await db.execute(sql`
      DELETE FROM season_batting
      WHERE player_id IN (SELECT id FROM players WHERE bref_id LIKE 'tcs\\_%')
    `);
    await db.execute(sql`DELETE FROM players WHERE bref_id LIKE 'tcs\\_%'`);
  }

  beforeAll(async () => {
    db = await getTestDatabase();
    await removeFixtures();

    for (const fixture of FIXTURES) {
      const inserted = await db.execute(sql`
        INSERT INTO players (first_name, last_name, bref_id, sport)
        VALUES ('Test', ${fixture.brefId}, ${fixture.brefId}, 'baseball')
        RETURNING id
      `);
      const id = Number((inserted.rows[0] as { id: number | string }).id);
      idsByBref.set(fixture.brefId, id);
      for (const [i, row] of fixture.rows.entries()) {
        await db.execute(sql`
          INSERT INTO season_batting (player_id, season, lg_id, team, row_id, g)
          VALUES (${id}, ${row.season}, ${row.lgId}, ${row.team}, ${`tcs-${i}`}, 100)
        `);
      }
    }
    fixtureIds = [...idsByBref.values()];

    await db.execute(sql`REFRESH MATERIALIZED VIEW career_batting`);
  });

  afterAll(async () => {
    await removeFixtures();
    await db.execute(sql`REFRESH MATERIALIZED VIEW career_batting`);
  });

  function brefsFor(ids: Iterable<number>): string[] {
    const byId = new Map([...idsByBref].map(([bref, id]) => [id, bref]));
    return [...ids].map((id) => byId.get(id) ?? `?${id}`).sort();
  }

  async function selectEligible(condition: SQL): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT p.id FROM players p
      WHERE p.id = ANY(${sql.param(fixtureIds)}::integer[]) AND ${condition}
    `);
    return brefsFor(
      (result.rows as Array<{ id: number | string }>).map((r) => Number(r.id)),
    );
  }

  it('career_batting.seasons equals the distinct AL/NL season count', async () => {
    const result = await db.execute(sql`
      SELECT p.bref_id, cb.seasons
      FROM players p
      LEFT JOIN career_batting cb ON cb.player_id = p.id
      WHERE p.id = ANY(${sql.param(fixtureIds)}::integer[])
      ORDER BY p.bref_id
    `);
    expect(
      (result.rows as Array<{ bref_id: string; seasons: number | null }>).map(
        (r) => [r.bref_id, r.seasons],
      ),
    ).toEqual([
      // Zero AL/NL seasons → no career_batting row at all.
      ['tcs_minor', null],
      ['tcs_none', null],
      ['tcs_one', 1],
      ['tcs_three', 3],
      ['tcs_trade', 2],
    ]);
  });

  it.each([1, 2, 3, 4])(
    'careerSeasonsCondition(%i) selects exactly the legacy predicate set',
    async (minCareerSeasons) => {
      const current = await selectEligible(
        careerSeasonsCondition(minCareerSeasons),
      );
      const legacy = await selectEligible(
        legacyCareerSeasonsCondition(minCareerSeasons),
      );
      expect(current).toEqual(EXPECTED[minCareerSeasons]);
      expect(current).toEqual(legacy);
    },
  );

  it.each([1, 2, 3, 4])(
    'filterPlayerIdsByLeagueEligibility applies the same rule at minCareerSeasons=%i',
    async (minCareerSeasons) => {
      const result = await filterPlayerIdsByLeagueEligibility(db, fixtureIds, {
        sport: 'baseball',
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons,
      });
      expect(brefsFor(result.eligibleIds)).toEqual(EXPECTED[minCareerSeasons]);
      expect(result.excludedByCareerSeasons).toBe(
        FIXTURES.length - EXPECTED[minCareerSeasons].length,
      );
    },
  );

  it('the draft ADP window ranks the same pool as the legacy predicate', async () => {
    const rankWith = async (seasons: SQL) => {
      const cte = buildDraftAdpCte({
        leagueId: null,
        leagueSport: 'baseball',
        poolConditions: [
          sql`p.sport = 'baseball'`,
          careerGamesCondition(50),
          seasons,
        ],
      });
      const result = await db.execute(sql`
        ${cte}
        SELECT player_id, adp FROM draft_adp ORDER BY player_id
      `);
      return (
        result.rows as Array<{ player_id: number | string; adp: string }>
      ).map((r) => [Number(r.player_id), Number(r.adp)]);
    };

    const current = await rankWith(careerSeasonsCondition(3));
    const legacy = await rankWith(legacyCareerSeasonsCondition(3));
    expect(current).toEqual(legacy);
    // The fixtures that survive both rules are in the window.
    const ranked = new Set(current.map(([id]) => id));
    expect(brefsFor(fixtureIds.filter((id) => ranked.has(id)))).toEqual(
      EXPECTED[3],
    );
  });
});
