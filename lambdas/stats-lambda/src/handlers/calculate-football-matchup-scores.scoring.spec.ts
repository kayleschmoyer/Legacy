/**
 * League-scoring behaviour of `calculateAndUpdateFootballMatchupScores`
 * (LS-9672).
 *
 * Separate from `calculate-football-matchup-scores.spec.ts`, which mocks
 * `@legacy-sports/scoring` wholesale to test SQS plumbing. These tests use the
 * *real* scoring functions and mock only the database, so they prove the
 * arithmetic the lambda persists.
 *
 * ## Verification scope
 *
 * These are unit tests against a mocked `PublicDb`, and that is the whole of
 * the verification here — there is deliberately **no** end-to-end coverage.
 * All six `game_football_*` tables are empty on dev RDS and football matchups
 * have zero game selections, so no football matchup has ever been scored and
 * there is nothing live to check the numbers against. That is precisely why
 * this defect is worth fixing now: the first real football scoring run should
 * write the league's numbers, not a set of wrong ones that then need a
 * rescore (cf. LS-9668).
 */

import type { PublicDb } from '@legacy-sports/db-client';
import {
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
  DEFAULT_PASSING_SCORING,
} from '@legacy-sports/scoring';

const mockGetMatchupFootballPlayerGameStats = jest.fn();
const mockUpdateMatchupScore = jest.fn();
const mockGetActiveScoringProfileForLeague = jest.fn();
const mockGetScoringStatDefinitions = jest.fn();
const mockGetScoringProfileEntriesForProfile = jest.fn();
const mockGetScoringPositionBonusesForProfile = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationPublisher: jest.fn(() => null),
}));

jest.mock('../football-metrics', () => ({
  emitFootballSuccess: jest.fn(),
  emitFootballFailure: jest.fn(),
}));

jest.mock('../football-notification-triggers', () => ({
  publishFootballGameAlerts: jest.fn(),
}));

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: jest.fn(),
  updateMatchupScore: (...args: unknown[]): unknown =>
    mockUpdateMatchupScore(...args),
  getMatchupFootballPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupFootballPlayerGameStats(...args),
  getActiveScoringProfileForLeague: (...args: unknown[]): unknown =>
    mockGetActiveScoringProfileForLeague(...args),
  getScoringStatDefinitions: (...args: unknown[]): unknown =>
    mockGetScoringStatDefinitions(...args),
  getScoringProfileEntriesForProfile: (...args: unknown[]): unknown =>
    mockGetScoringProfileEntriesForProfile(...args),
  getScoringPositionBonusesForProfile: (...args: unknown[]): unknown =>
    mockGetScoringPositionBonusesForProfile(...args),
  normalizeNumeric: (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  },
  PublicSchema: {
    matchupPlayers: {
      id: 'id',
      matchupId: 'matchupId',
      teamId: 'teamId',
      positionId: 'positionId',
    },
    leaguePosition: { id: 'id', positionType: 'positionType' },
  },
}));

import { calculateAndUpdateFootballMatchupScores } from './calculate-football-matchup-scores';

// ── Fixtures ────────────────────────────────────────────────────────────────

const MATCHUP_ID = 7;
const LEAGUE_ID = 42;
const TEAM_1 = 1;
const TEAM_2 = 2;

interface MatchupPlayerRow {
  matchupPlayerId: number;
  teamId: number;
  positionType: string | null;
}

/**
 * Minimal `PublicDb` stand-in: `query.matchups.findFirst` plus the
 * select/leftJoin/where chain the handler uses to load matchup players.
 */
function makeDb(matchupPlayers: MatchupPlayerRow[]): PublicDb {
  const db = {
    query: {
      matchups: {
        findFirst: jest.fn().mockResolvedValue({
          id: MATCHUP_ID,
          leagueId: LEAGUE_ID,
          team1Id: TEAM_1,
          team2Id: TEAM_2,
          team1Score: null,
          team2Score: null,
        }),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        leftJoin: jest.fn(() => ({
          where: jest.fn(() => matchupPlayers),
        })),
      })),
    })),
  };

  return db as unknown as PublicDb;
}

/** One QB game: 300 passing yards, 2 passing TDs, 1 interception. */
function quarterbackGame(matchupPlayerId: number) {
  return {
    playerId: 100,
    matchupPlayerId,
    gameNum: 1,
    gameIdentifier: 'g1',
    offense: {
      passYds: 300,
      passTd: 2,
      interceptions: 1,
      sacked: null,
      rushYds: null,
      rushTd: null,
      rushFumbles: null,
      rec: null,
      recYds: null,
      recTd: null,
      recFumbles: null,
      fgm: null,
      fg50m: null,
      xpm: null,
    },
    defense: null,
    idpDefense: null,
  };
}

/** One DST game: shutout, 3 sacks, 1 interception. */
function dstGame(matchupPlayerId: number) {
  return {
    playerId: 200,
    matchupPlayerId,
    gameNum: 1,
    gameIdentifier: 'g1',
    offense: null,
    defense: {
      sacks: 3,
      interceptions: 1,
      fumblesRec: null,
      defTd: null,
      safeties: null,
      ptsAllowed: 0,
      ydsAllowed: 210,
      passYdsAllowed: null,
      rushYdsAllowed: null,
    },
    idpDefense: null,
  };
}

const PASSING_YDS_DEFINITION = {
  id: 42,
  statKey: 'passing_yds',
  statGroup: 'passing',
  sourceTable: 'game_football_passing',
  sourceColumn: 'yds',
  defaultMultiplier: String(DEFAULT_PASSING_SCORING.yds),
};

const DEFENSE_SHUTOUT_BAND_DEFINITION = {
  id: 61,
  statKey: 'defense_pts_band_0',
  statGroup: 'defense',
  sourceTable: 'game_football_defense',
  sourceColumn: 'pts_band_0',
  defaultMultiplier: String(DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS.pts_0),
};

/** No scoring profile → the league falls back to platform defaults. */
function withoutProfile(): void {
  mockGetActiveScoringProfileForLeague.mockResolvedValue(null);
}

/** An active profile whose `entries` override the given definitions. */
function withProfile(
  definitions: Record<string, unknown>[],
  entries: Record<string, unknown>[],
): void {
  mockGetActiveScoringProfileForLeague.mockResolvedValue({
    id: 900,
    leagueId: LEAGUE_ID,
  });
  mockGetScoringStatDefinitions.mockResolvedValue(definitions);
  mockGetScoringProfileEntriesForProfile.mockResolvedValue(entries);
}

async function scoreMatchup(db: PublicDb) {
  return calculateAndUpdateFootballMatchupScores(db, MATCHUP_ID, true);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('calculateAndUpdateFootballMatchupScores — league scoring settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetScoringStatDefinitions.mockResolvedValue([]);
    mockGetScoringProfileEntriesForProfile.mockResolvedValue([]);
    mockGetScoringPositionBonusesForProfile.mockResolvedValue([]);
    mockUpdateMatchupScore.mockImplementation(
      (_db: unknown, _id: number, team1Score: number, team2Score: number) => ({
        team1Score: String(team1Score),
        team2Score: String(team2Score),
      }),
    );
  });

  it('resolves the league profile rather than assuming defaults (AC1)', async () => {
    withoutProfile();
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([]);

    await scoreMatchup(makeDb([]));

    // The defect was that this call never happened: the lambda scored every
    // league from the hardcoded DEFAULT_* constants.
    expect(mockGetActiveScoringProfileForLeague).toHaveBeenCalledWith(
      expect.anything(),
      LEAGUE_ID,
    );
  });

  it('scores from the platform defaults when the league has no profile (AC4)', async () => {
    withoutProfile();
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([
      quarterbackGame(10),
    ]);

    const result = await scoreMatchup(
      makeDb([{ matchupPlayerId: 10, teamId: TEAM_1, positionType: 'QB' }]),
    );

    // 300 * 0.04 + 2 * 4 + 1 * -2 = 18
    expect(result.team1Score).toBeCloseTo(18, 5);
    expect(result.team2Score).toBe(0);
  });

  it('a league with an override scores differently from one without (AC2)', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([
      quarterbackGame(10),
    ]);
    const players = [
      { matchupPlayerId: 10, teamId: TEAM_1, positionType: 'QB' },
    ];

    withoutProfile();
    const unconfigured = await scoreMatchup(makeDb(players));

    // Same league, same stat line — only the passing-yards multiplier moves,
    // from the default 0.04 to 0.10 (6 points per 100 yards instead of 4).
    withProfile(
      [PASSING_YDS_DEFINITION],
      [{ statDefinitionId: 42, multiplier: '0.1', isEnabled: true }],
    );
    const configured = await scoreMatchup(makeDb(players));

    // 300 * 0.10 + 2 * 4 + 1 * -2 = 36
    expect(configured.team1Score).toBeCloseTo(36, 5);
    expect(configured.team1Score).not.toBeCloseTo(unconfigured.team1Score, 5);
  });

  it('applies a DST points-allowed band override (AC3)', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([dstGame(20)]);
    const players = [
      { matchupPlayerId: 20, teamId: TEAM_2, positionType: 'DST' },
    ];

    withoutProfile();
    const unconfigured = await scoreMatchup(makeDb(players));

    // 3 sacks * 1 + 1 int * 2 + shutout band 10 = 15
    expect(unconfigured.team2Score).toBeCloseTo(15, 5);

    // The band override arrives as a `defense`-group definition named
    // `pts_band_0`, which has to be routed to `defenseBands.pts_0` — it is
    // NOT a flat `defense` multiplier, and routing by group name alone would
    // silently drop it (LS-9672).
    withProfile(
      [DEFENSE_SHUTOUT_BAND_DEFINITION],
      [{ statDefinitionId: 61, multiplier: '20', isEnabled: true }],
    );
    const configured = await scoreMatchup(makeDb(players));

    // 3 sacks * 1 + 1 int * 2 + shutout band 20 = 25
    expect(configured.team2Score).toBeCloseTo(25, 5);
  });

  it('applies a position-scoped bonus from the league profile', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([
      quarterbackGame(10),
    ]);

    withProfile([PASSING_YDS_DEFINITION], []);
    mockGetScoringPositionBonusesForProfile.mockResolvedValue([
      {
        statDefinitionId: 42,
        position: 'QB',
        bonusMultiplier: '0.01',
        isEnabled: true,
      },
    ]);

    const result = await scoreMatchup(
      makeDb([{ matchupPlayerId: 10, teamId: TEAM_1, positionType: 'QB' }]),
    );

    // 300 * (0.04 base + 0.01 QB bonus) + 2 * 4 + 1 * -2 = 21
    expect(result.team1Score).toBeCloseTo(21, 5);
  });

  it('splits scores across the two teams', async () => {
    withoutProfile();
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([
      quarterbackGame(10),
      dstGame(20),
    ]);

    const result = await scoreMatchup(
      makeDb([
        { matchupPlayerId: 10, teamId: TEAM_1, positionType: 'QB' },
        { matchupPlayerId: 20, teamId: TEAM_2, positionType: 'DST' },
      ]),
    );

    expect(result.team1Score).toBeCloseTo(18, 5);
    expect(result.team2Score).toBeCloseTo(15, 5);
  });
});
