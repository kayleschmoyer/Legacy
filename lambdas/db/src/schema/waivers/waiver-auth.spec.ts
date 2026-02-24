/**
 * Tests for processWaiverClaims authorization.
 *
 * The assertAuthorized function is shared with scheduled-mutations and
 * is now re-used by the waiver mutation. These tests verify the auth
 * behaviour directly and in the context of waiver processing.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/sentry', () => ({
  getSentryConfigFromEnv: jest.fn(),
  initSentry: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withSentry: jest.fn((fn: unknown) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
}));

jest.mock('@legacy-sports/utils', () => ({
  getDbOptions: jest.fn(() => ({})),
  isNegroLeague: jest.fn(() => false),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  SendMessageCommand: jest.fn(),
}));

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      name: 'leagues.name',
      draftStatus: 'leagues.draft_status',
      gamesPerMatchup: 'leagues.games_per_matchup',
      weekAdvanceStatus: 'leagues.week_advance_status',
      spStartsPerMatchup: 'leagues.sp_starts_per_matchup',
      totalMatchups: 'leagues.total_matchups',
    },
    matchups: {
      id: 'matchups.id',
      leagueId: 'matchups.league_id',
      weekNumber: 'matchups.week_number',
      status: 'matchups.status',
      gamesPerMatchup: 'matchups.games_per_matchup',
      statsLoadingStatus: 'matchups.stats_loading_status',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
      team1Score: 'matchups.team1_score',
      team2Score: 'matchups.team2_score',
      spStartsPerMatchup: 'matchups.sp_starts_per_matchup',
      startTime: 'matchups.start_time',
      endTime: 'matchups.end_time',
    },
    matchupPlayers: {
      id: 'matchup_players.id',
      matchupId: 'matchup_players.matchup_id',
      playerId: 'matchup_players.player_id',
      teamId: 'matchup_players.team_id',
      positionId: 'matchup_players.position_id',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchup_player_games.matchup_player_id',
      gameNum: 'matchup_player_games.game_num',
    },
    teams: {
      id: 'teams.id',
      name: 'teams.name',
      leagueId: 'teams.league_id',
    },
    teamMembers: {
      playerId: 'team_members.player_id',
      positionId: 'team_members.position_id',
      leagueId: 'team_members.league_id',
      teamId: 'team_members.team_id',
    },
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      permissionLevel: 'league_members.permission_level',
    },
    waiverClaims: {
      id: 'waiver_claims.id',
      leagueId: 'waiver_claims.league_id',
      teamId: 'waiver_claims.team_id',
      userId: 'waiver_claims.user_id',
      playerId: 'waiver_claims.player_id',
      status: 'waiver_claims.status',
    },
  },
}));

import { assertAuthorized } from '../matchups/scheduled-mutations';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockDb(selectResult: unknown[] = []) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(selectResult),
  };
  return chain as unknown;
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    isSystemRequest: false,
    user: null,
    db: mockDb(),
    ...overrides,
  } as Parameters<typeof assertAuthorized>[0];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('processWaiverClaims — authorization', () => {
  it('should allow system requests without leagueId', async () => {
    await expect(
      assertAuthorized(ctx({ isSystemRequest: true }), null),
    ).resolves.toBeUndefined();
  });

  it('should allow system requests with leagueId', async () => {
    await expect(
      assertAuthorized(ctx({ isSystemRequest: true }), 42),
    ).resolves.toBeUndefined();
  });

  it('should allow admin users without leagueId', async () => {
    await expect(
      assertAuthorized(ctx({ user: { id: 1, isAdmin: true } }), null),
    ).resolves.toBeUndefined();
  });

  it('should allow admin users with leagueId', async () => {
    await expect(
      assertAuthorized(ctx({ user: { id: 1, isAdmin: true } }), 42),
    ).resolves.toBeUndefined();
  });

  it('should reject unauthenticated requests', async () => {
    await expect(assertAuthorized(ctx(), null)).rejects.toThrow(
      'Unauthorized: system mutations require authentication.',
    );
  });

  it('should reject non-admin users without leagueId', async () => {
    await expect(
      assertAuthorized(ctx({ user: { id: 5, isAdmin: false } }), null),
    ).rejects.toThrow(
      'Unauthorized: only admins or system processes can trigger mutations for all leagues.',
    );
  });

  it('should allow commissioner with own leagueId', async () => {
    const db = mockDb([{ permissionLevel: 'commissioner' }]);
    await expect(
      assertAuthorized(ctx({ user: { id: 5, isAdmin: false }, db }), 42),
    ).resolves.toBeUndefined();
  });

  it('should allow owner with own leagueId', async () => {
    const db = mockDb([{ permissionLevel: 'owner' }]);
    await expect(
      assertAuthorized(ctx({ user: { id: 5, isAdmin: false }, db }), 42),
    ).resolves.toBeUndefined();
  });

  it('should reject regular member even with leagueId', async () => {
    const db = mockDb([{ permissionLevel: 'member' }]);
    await expect(
      assertAuthorized(ctx({ user: { id: 5, isAdmin: false }, db }), 42),
    ).rejects.toThrow(
      'Unauthorized: only the league owner or commissioner can trigger this mutation for their league.',
    );
  });

  it('should reject user with no membership in league', async () => {
    const db = mockDb([]);
    await expect(
      assertAuthorized(ctx({ user: { id: 5, isAdmin: false }, db }), 42),
    ).rejects.toThrow(
      'Unauthorized: only the league owner or commissioner can trigger this mutation for their league.',
    );
  });
});
