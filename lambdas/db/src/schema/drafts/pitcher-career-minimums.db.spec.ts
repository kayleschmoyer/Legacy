/**
 * Pitcher career minimums — DB Integration Tests (LS-10807)
 *
 * Leagues can set career minimums for pitchers (games pitched / seasons with a
 * pitching appearance) separate from the batter minimums. These tests run the
 * real eligibility predicates against fixture players of every role — position
 * player, pure pitcher (modern, no batting row; and old-era, who batted in the
 * games they pitched) and two-way player — above and below each threshold, and
 * pin that leagues with no pitcher minimums keep the legacy batter-only rule.
 */

import { type SQL, sql } from 'drizzle-orm';
import {
  buildEligibilityConditions,
  filterPlayerIdsByLeagueEligibility,
  findFailedEligibilityRule,
  type LeagueEligibilitySettings,
} from '@legacy-sports/db-client';
import { getTestDatabase } from '../../../integration-test-setup';

type Seasons = Array<{ season: number; g: number }>;

// bref_id is varchar(10) and unique; the prefix keeps fixtures recognisable.
const FIXTURES: Array<{ brefId: string; batting: Seasons; pitching: Seasons }> =
  [
    // Modern pure pitcher, 8 G / 1 season (the Nolan McLean report).
    {
      brefId: 'tpc_p_low',
      batting: [],
      pitching: [{ season: 2025, g: 8 }],
    },
    // Modern pure pitcher, 90 G / 3 seasons.
    {
      brefId: 'tpc_p_high',
      batting: [],
      pitching: [
        { season: 2022, g: 30 },
        { season: 2023, g: 30 },
        { season: 2024, g: 30 },
      ],
    },
    // Old-era pure pitcher: batted only in the 30 games they pitched.
    {
      brefId: 'tpc_p_old',
      batting: [
        { season: 1960, g: 10 },
        { season: 1961, g: 10 },
        { season: 1962, g: 10 },
      ],
      pitching: [
        { season: 1960, g: 10 },
        { season: 1961, g: 10 },
        { season: 1962, g: 10 },
      ],
    },
    // Position player, 20 G / 1 season.
    { brefId: 'tpc_b_low', batting: [{ season: 2024, g: 20 }], pitching: [] },
    // Position player, 400 G / 4 seasons.
    {
      brefId: 'tpc_b_high',
      batting: [
        { season: 2020, g: 100 },
        { season: 2021, g: 100 },
        { season: 2022, g: 100 },
        { season: 2023, g: 100 },
      ],
      pitching: [],
    },
    // Two-way, passes only the batter set (one 5-game mop-up pitching season).
    {
      brefId: 'tpc_tw_bat',
      batting: [
        { season: 2020, g: 100 },
        { season: 2021, g: 100 },
        { season: 2022, g: 100 },
        { season: 2023, g: 100 },
      ],
      pitching: [{ season: 2023, g: 5 }],
    },
    // Two-way, passes only the pitcher set (2 batting seasons < 3).
    {
      brefId: 'tpc_tw_pit',
      batting: [
        { season: 2022, g: 60 },
        { season: 2023, g: 60 },
      ],
      pitching: [
        { season: 2022, g: 30 },
        { season: 2023, g: 30 },
        { season: 2024, g: 30 },
      ],
    },
    // Two-way, below both sets.
    {
      brefId: 'tpc_tw_low',
      batting: [{ season: 2024, g: 40 }],
      pitching: [{ season: 2024, g: 10 }],
    },
  ];

const ALL = FIXTURES.map((f) => f.brefId).sort();

function settings(
  overrides: Partial<LeagueEligibilitySettings>,
): LeagueEligibilitySettings {
  return {
    sport: 'baseball',
    playerPool: 'all',
    minCareerGames: 50,
    minCareerSeasons: 3,
    ...overrides,
  };
}

describe('Pitcher career minimums — DB Integration Tests (LS-10807)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;
  const idsByBref = new Map<string, number>();
  let fixtureIds: number[] = [];

  async function refreshCareerViews() {
    await db.execute(sql`REFRESH MATERIALIZED VIEW career_batting`);
    await db.execute(
      sql`REFRESH MATERIALIZED VIEW career_pitching_appearances`,
    );
  }

  async function removeFixtures() {
    const fixturePlayers = sql`(SELECT id FROM players WHERE bref_id LIKE 'tpc\\_%')`;
    await db.execute(
      sql`DELETE FROM season_batting WHERE player_id IN ${fixturePlayers}`,
    );
    await db.execute(
      sql`DELETE FROM season_pitching WHERE player_id IN ${fixturePlayers}`,
    );
    await db.execute(sql`DELETE FROM players WHERE bref_id LIKE 'tpc\\_%'`);
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
      for (const [i, row] of fixture.batting.entries()) {
        await db.execute(sql`
          INSERT INTO season_batting (player_id, season, lg_id, team, row_id, g)
          VALUES (${id}, ${row.season}, 'NL', 'NYN', ${`tpc-b-${i}`}, ${row.g})
        `);
      }
      for (const [i, row] of fixture.pitching.entries()) {
        await db.execute(sql`
          INSERT INTO season_pitching (player_id, season, lg_id, team, row_id, g)
          VALUES (${id}, ${row.season}, 'NL', 'NYN', ${`tpc-p-${i}`}, ${row.g})
        `);
      }
    }
    fixtureIds = [...idsByBref.values()];
    await refreshCareerViews();
  });

  afterAll(async () => {
    await removeFixtures();
    await refreshCareerViews();
  });

  function brefsFor(ids: Iterable<number>): string[] {
    const byId = new Map([...idsByBref].map(([bref, id]) => [id, bref]));
    return [...ids].map((id) => byId.get(id) ?? `?${id}`).sort();
  }

  /** Fixtures that pass every career predicate the league settings build. */
  async function draftBoardPool(
    s: LeagueEligibilitySettings,
  ): Promise<string[]> {
    const conditions: SQL[] = buildEligibilityConditions(s).map(
      (c) => c.condition,
    );
    const result = await db.execute(sql`
      SELECT p.id FROM players p
      WHERE p.id = ANY(${sql.param(fixtureIds)}::integer[])
        ${conditions.length ? sql`AND ${sql.join(conditions, sql` AND `)}` : sql``}
    `);
    return brefsFor(
      (result.rows as Array<{ id: number | string }>).map((r) => Number(r.id)),
    );
  }

  async function batchPool(s: LeagueEligibilitySettings): Promise<string[]> {
    const result = await filterPlayerIdsByLeagueEligibility(db, fixtureIds, s);
    return brefsFor(result.eligibleIds);
  }

  const without = (...excluded: string[]) =>
    ALL.filter((b) => !excluded.includes(b));

  it('career_pitching_appearances holds AL/NL games pitched and distinct seasons', async () => {
    const result = await db.execute(sql`
      SELECT p.bref_id, cpa.g, cpa.seasons
      FROM players p
      JOIN career_pitching_appearances cpa ON cpa.player_id = p.id
      WHERE p.id = ANY(${sql.param(fixtureIds)}::integer[])
      ORDER BY p.bref_id
    `);
    expect(
      (
        result.rows as Array<{
          bref_id: string;
          g: number | string;
          seasons: number;
        }>
      ).map((r) => [r.bref_id, Number(r.g), r.seasons]),
    ).toEqual([
      ['tpc_p_high', 90, 3],
      ['tpc_p_low', 8, 1],
      ['tpc_p_old', 30, 3],
      ['tpc_tw_bat', 5, 1],
      ['tpc_tw_low', 10, 1],
      ['tpc_tw_pit', 90, 3],
    ]);
  });

  describe.each([
    ['draft board / pick predicates', draftBoardPool],
    ['batch eligibility filter', batchPool],
  ])('%s', (_label, pool) => {
    it('excludes pitchers below the pitcher minimums and keeps those above (25 G / 3 seasons)', async () => {
      // Batters judged on 50 G / 3 seasons, pitchers on 25 G / 3 seasons
      // (the old-era pitcher's 30 G pitched clears it); two-way players pass
      // if they clear either full set.
      expect(
        await pool(
          settings({ minCareerPitcherGames: 25, minCareerPitcherSeasons: 3 }),
        ),
      ).toEqual([
        'tpc_b_high',
        'tpc_p_high',
        'tpc_p_old',
        'tpc_tw_bat',
        'tpc_tw_pit',
      ]);
    });

    it('pitcher minimums do not affect position players', async () => {
      expect(
        await pool(
          settings({
            minCareerGames: 0,
            minCareerSeasons: 0,
            minCareerPitcherGames: 25,
            minCareerPitcherSeasons: 3,
          }),
        ),
      ).toEqual(without('tpc_p_low'));
    });

    it('batter minimums do not affect pure pitchers once pitcher minimums are set', async () => {
      // The old-era pitcher's 30 batting games no longer count against the
      // 50-game batter rule; they are judged on their 30 games pitched.
      expect(
        await pool(
          settings({ minCareerPitcherGames: 1, minCareerPitcherSeasons: 1 }),
        ),
      ).toEqual(without('tpc_b_low'));
    });

    it('a pitcher-games-only rule leaves seasons on the batter threshold for batters', async () => {
      expect(
        await pool(
          settings({ minCareerSeasons: 0, minCareerPitcherGames: 25 }),
        ),
      ).toEqual([
        'tpc_b_high',
        'tpc_p_high',
        'tpc_p_old',
        'tpc_tw_bat',
        'tpc_tw_pit',
      ]);
    });

    it('leagues with no pitcher minimums keep the legacy batter-only rule', async () => {
      // Pure pitchers with no batting row pass; the old-era pitcher is still
      // held to their 30 batting games, exactly as before LS-10807.
      const legacy = ['tpc_b_high', 'tpc_p_high', 'tpc_p_low', 'tpc_tw_bat'];
      expect(await pool(settings({}))).toEqual(legacy);
      expect(
        await pool(
          settings({ minCareerPitcherGames: 0, minCareerPitcherSeasons: 0 }),
        ),
      ).toEqual(legacy);
    });
  });

  it('rejects a pick of a below-minimum pitcher with the career-games rule', async () => {
    const failed = await findFailedEligibilityRule(
      db,
      idsByBref.get('tpc_p_low') as number,
      settings({ minCareerPitcherGames: 25, minCareerPitcherSeasons: 3 }),
    );
    expect(failed?.key).toBe('careerGames');
    expect(failed?.message).toContain('batters 50, pitchers 25');

    const passed = await findFailedEligibilityRule(
      db,
      idsByBref.get('tpc_p_high') as number,
      settings({ minCareerPitcherGames: 25, minCareerPitcherSeasons: 3 }),
    );
    expect(passed).toBeNull();
  });
});
