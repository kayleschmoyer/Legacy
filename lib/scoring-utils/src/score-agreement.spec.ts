/**
 * AC7 (LS-9532): the matchup detail view and the standings table must agree on
 * the score of a matchup that contains a repeated game.
 *
 * The two are computed by completely separate code. Matchup detail renders
 * `matchups.team1_score`, the number `scoreMatchup` persists after aggregating
 * per-slot stat rows through the scoring engine. Standings never read that
 * column — `calculateStandings` recomputes every matchup from a batch of
 * league-wide pair-join queries and its own summation loop. Two independent
 * implementations of "what is this matchup worth" is exactly the shape that
 * lets a semantic change land on one side only, which is what happened while
 * `getMatchupPlayerGameStats` deduped repeated selections and
 * `calculateStandings` did not.
 *
 * So this spec runs BOTH real implementations — no scoring mocked on either
 * side, including the snake_case → camelCase multiplier resolution both share —
 * over one fixture where a single real game fills three slots, and asserts they
 * land on the same number. The mock databases differ only because the two paths
 * ask for the data differently; the data they describe is identical.
 */

import { calculateStandings, type PublicDb } from '@legacy-sports/db-client';

import { scoreMatchup } from './matchup-score';

// ── The fixture, stated once ────────────────────────────────────────────────

const LEAGUE_ID = 10;
const WEEK_NUMBER = 1;
const MATCHUP_ID = 500;
const TEAM1_ID = 1;
const TEAM2_ID = 2;
const PLAYER_ID = 100;
const MATCHUP_PLAYER_ID = 7;
const SEASON = 2021;
const GAME_IDENTIFIER = 'ANA202104150';

/** The same real game, selected into three of the matchup's slots. */
const SLOT_COUNT = 3;

/**
 * The league has no custom scoring profile, so both paths derive their weights
 * from `scoring_stat_definitions.default_multiplier`. Note the snake_case
 * `source_column`s: converting them is a step both paths must perform, and
 * getting it wrong is silent (LS-9532).
 */
const STAT_DEFINITIONS = [
  {
    id: 1,
    statGroup: 'batting',
    sourceColumn: 'h',
    defaultMultiplier: '1',
  },
  {
    id: 2,
    statGroup: 'batting',
    sourceColumn: 'hr',
    defaultMultiplier: '4',
  },
  {
    id: 3,
    statGroup: 'pitching',
    sourceColumn: 'outs_recorded',
    defaultMultiplier: '1',
  },
];

/** One game: 2 hits and a home run. Worth 2×1 + 1×4 = 6 under the profile. */
const SINGLE_GAME_SCORE = 6;
const EXPECTED_SCORE = SINGLE_GAME_SCORE * SLOT_COUNT; // 18, not 6

const BATTING_ROW = {
  playerId: PLAYER_ID,
  season: SEASON,
  gameIdentifier: GAME_IDENTIFIER,
  gameNum: 1,
  h: 2,
  hr: 1,
};

/** The three matchup_player_games rows, all pointing at the one game. */
const SLOT_ROWS = Array.from({ length: SLOT_COUNT }, (_, i) => ({
  matchupPlayerId: MATCHUP_PLAYER_ID,
  gameNum: i + 1,
  gameIdentifier: GAME_IDENTIFIER,
}));

// ── Mock database plumbing ──────────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * A Drizzle stub that answers the i-th `select()` with `selects[i]` and the
 * i-th `execute()` with `{ rows: executes[i] }`. Both paths issue their queries
 * in a fixed order, so position is enough to script them.
 */
function createMockDb(selects: Row[][], executes: Row[][] = []) {
  let selectIndex = 0;
  let executeIndex = 0;
  const scoreWrites: Row[] = [];

  const makeChain = (result: Row[]): Record<string, unknown> => {
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      leftJoin: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      groupBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      offset: jest.fn(() => chain),
      then: (onFulfilled: (value: Row[]) => unknown) => onFulfilled(result),
    };
    return chain;
  };

  const update = jest.fn(() => ({
    set: jest.fn((payload: Row) => {
      scoreWrites.push(payload);
      return {
        where: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([payload])),
        })),
      };
    }),
  }));

  // updateMatchupScore takes a `SELECT ... FOR UPDATE` row lock inside a
  // transaction before writing (LS-6391). The lock read gets its own chain so
  // it does not consume the scripted `selects` the scoring reads depend on.
  const tx = {
    select: jest.fn(() => {
      const chain = makeChain([{ scoreVersion: 0 }]);
      chain.for = jest.fn(() => chain);
      return chain;
    }),
    update,
  };

  const db = {
    select: jest.fn(() => makeChain(selects[selectIndex++] ?? [])),
    transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    execute: jest.fn(() =>
      Promise.resolve({ rows: executes[executeIndex++] ?? [] }),
    ),
    // updateMatchupScore's write path. Capturing the payload is how this spec
    // reads back the number the matchup detail view would render.
    update,
    query: {
      matchups: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: MATCHUP_ID,
            leagueId: LEAGUE_ID,
            team1Id: TEAM1_ID,
            team2Id: TEAM2_ID,
            gamesPerMatchup: 5,
            team1Score: null,
            team2Score: null,
          }),
        ),
      },
    },
  };

  return { db: db as unknown as PublicDb, scoreWrites };
}

/**
 * Query order for `scoreMatchup`:
 *   getCamelCaseScoringMultipliersForLeague — stat definitions, league profile
 *   getMatchupPlayerGameStats — matchup info, matchup players, selected games,
 *     matchup, team members, then batting/pitching/fielding for the one
 *     distinct (player, season, game) triple
 */
function createPersistedScoreDb() {
  return createMockDb([
    STAT_DEFINITIONS,
    [], // no custom league scoring profile — defaults apply
    [{ leagueId: LEAGUE_ID, weekNumber: WEEK_NUMBER }],
    [
      {
        matchupPlayerId: MATCHUP_PLAYER_ID,
        playerId: PLAYER_ID,
        season: SEASON,
        matchupId: MATCHUP_ID,
      },
    ],
    SLOT_ROWS,
    [
      {
        id: MATCHUP_ID,
        leagueId: LEAGUE_ID,
        team1Id: TEAM1_ID,
        team2Id: TEAM2_ID,
      },
    ],
    [{ teamId: TEAM1_ID, playerId: PLAYER_ID, leagueId: LEAGUE_ID }],
    [BATTING_ROW],
    [], // pitching
    [], // fielding
  ]);
}

/**
 * Query order for `calculateStandings`:
 *   teams, league (medianGameEnabled), stat definitions, league profile,
 *   matchups, matchup players, matchup player games, player seasons
 * then three `execute()`s: batting pair-join, pitching pair-join, fielding probe.
 */
function createStandingsDb() {
  return createMockDb(
    [
      [
        { id: TEAM1_ID, name: 'Team One', divisionId: null },
        { id: TEAM2_ID, name: 'Team Two', divisionId: null },
      ],
      [{ medianGameEnabled: false }],
      STAT_DEFINITIONS,
      [], // no custom league scoring profile — defaults apply
      [
        {
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          weekNumber: WEEK_NUMBER,
          team1Id: TEAM1_ID,
          team2Id: TEAM2_ID,
          status: 'completed',
        },
      ],
      [
        {
          id: MATCHUP_PLAYER_ID,
          matchupId: MATCHUP_ID,
          teamId: TEAM1_ID,
          playerId: PLAYER_ID,
        },
      ],
      SLOT_ROWS,
      [{ weekNumber: WEEK_NUMBER, playerId: PLAYER_ID, season: SEASON }],
    ],
    [
      [BATTING_ROW], // batting pair-join
      [], // pitching pair-join
      [], // game_fielding empty — probe returns no rows
    ],
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('matchup detail and standings agree on a repeated game (LS-9532 AC7)', () => {
  it('persists the N-times score for the matchup detail view', async () => {
    const { db, scoreWrites } = createPersistedScoreDb();

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.team1Score).toBe(EXPECTED_SCORE);
    expect(result.team1GamesSelected).toBe(SLOT_COUNT);
    // The number the UI renders is the persisted column, so assert on the write
    // rather than only on the return value.
    expect(scoreWrites).toEqual([
      expect.objectContaining({ team1Score: String(EXPECTED_SCORE) }),
    ]);
  });

  it('counts the same game N times in the standings recompute', async () => {
    const { db } = createStandingsDb();

    const standings = await calculateStandings(db, LEAGUE_ID);
    const team1 = standings.find((s) => s.teamId === TEAM1_ID);

    expect(team1?.pointsFor).toBe(EXPECTED_SCORE);
  });

  it('produces the same score from both paths', async () => {
    const { db: scoringDb } = createPersistedScoreDb();
    const { db: standingsDb } = createStandingsDb();

    const persisted = await scoreMatchup(scoringDb, MATCHUP_ID, LEAGUE_ID);
    const standings = await calculateStandings(standingsDb, LEAGUE_ID);
    const team1 = standings.find((s) => s.teamId === TEAM1_ID);

    // The assertion that matters: not that either equals 18, but that they
    // equal each other. A future change to one semantic must move both.
    expect(persisted.team1Score).toBe(team1?.pointsFor);

    // And that they agree on the N-times reading specifically — both would
    // also "agree" at 6 if the dedupe came back on both sides at once.
    expect(persisted.team1Score).toBe(EXPECTED_SCORE);
  });
});
