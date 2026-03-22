/**
 * League GraphQL mock data factories.
 *
 * Covers: league, userLeagues, leagueTeams, leaguePositions,
 *         createLeagueAndTeams, updateLeagueSettings, leagueScoringProfile.
 */

export interface MockLeague {
  __typename: 'League';
  id: number;
  name: string;
  description: string;
  owner: number;
  maxRosterSize: number;
  draftStatus: 'not-started' | 'queued' | 'in-progress' | 'completed';
  currentMatchup: number | null;
  numberOfTeams: number;
  playerPool: string;
  draftMode: 'live' | 'slow';
  selectionMethod: string;
  draftOrder: string;
  isPublic: boolean;
  maxBatters: number;
  maxPitchers: number;
  tradingEnabled: boolean;
  waiverEnabled: boolean;
  startDate: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export function mockLeague(overrides: Partial<MockLeague> = {}): MockLeague {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    description: 'A test league for E2E testing',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'not-started',
    currentMatchup: null,
    numberOfTeams: 10,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    isPublic: false,
    maxBatters: 14,
    maxPitchers: 9,
    tradingEnabled: true,
    waiverEnabled: true,
    startDate: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    ...overrides,
  };
}

export interface MockTeam {
  __typename: 'Team';
  id: number;
  name: string;
  owner: number | null;
}

export function mockTeam(overrides: Partial<MockTeam> = {}): MockTeam {
  return {
    __typename: 'Team',
    id: 1,
    name: 'Team 1',
    owner: 1,
    ...overrides,
  };
}

export interface MockPosition {
  __typename: 'LeaguePosition';
  id: number;
  name: string;
  abbrev: string;
}

export function mockPosition(
  overrides: Partial<MockPosition> = {},
): MockPosition {
  return {
    __typename: 'LeaguePosition',
    id: 1,
    name: 'Catcher',
    abbrev: 'C',
    ...overrides,
  };
}

/** Standard set of baseball positions. */
export function mockPositions(): MockPosition[] {
  return [
    mockPosition({ id: 1, name: 'Catcher', abbrev: 'C' }),
    mockPosition({ id: 2, name: 'First Base', abbrev: '1B' }),
    mockPosition({ id: 3, name: 'Second Base', abbrev: '2B' }),
    mockPosition({ id: 4, name: 'Third Base', abbrev: '3B' }),
    mockPosition({ id: 5, name: 'Shortstop', abbrev: 'SS' }),
    mockPosition({ id: 6, name: 'Left Field', abbrev: 'LF' }),
    mockPosition({ id: 7, name: 'Center Field', abbrev: 'CF' }),
    mockPosition({ id: 8, name: 'Right Field', abbrev: 'RF' }),
    mockPosition({ id: 9, name: 'Starting Pitcher', abbrev: 'SP' }),
    mockPosition({ id: 10, name: 'Relief Pitcher', abbrev: 'RP' }),
  ];
}

// ── Response factories ──────────────────────────────────────────────

export function leagueByIdResponse(league?: Partial<MockLeague>) {
  return { data: { league: mockLeague(league) } };
}

export function userLeaguesResponse(leagues?: Partial<MockLeague>[]) {
  return {
    data: {
      userLeagues: (leagues ?? [{}]).map((l) => mockLeague(l)),
    },
  };
}

export function leagueTeamsResponse(teams?: Partial<MockTeam>[]) {
  return {
    data: {
      leagueTeams: teams?.map((t) => mockTeam(t)) ?? [
        mockTeam({ id: 1, name: 'Team 1', owner: 1 }),
        mockTeam({ id: 2, name: 'Team 2', owner: null }),
      ],
    },
  };
}

export function leaguePositionsResponse(positions?: MockPosition[]) {
  return {
    data: { leaguePositions: positions ?? mockPositions() },
  };
}

export function userTeamIdResponse(teamId = 1) {
  return {
    data: { userTeamId: { __typename: 'UserTeamId' as const, teamId } },
  };
}

export function leagueScoringProfileResponse(
  profile: Record<string, unknown> | null = null,
) {
  return { data: { leagueScoringProfile: profile } };
}

export function createLeagueResponse(league?: Partial<MockLeague>) {
  return {
    data: {
      createLeagueAndTeams: {
        __typename: 'CreateLeagueAndTeamsPayload' as const,
        league: mockLeague({ id: 999, ...league }),
      },
    },
  };
}

export function updateLeagueBrandingResponse(patch?: {
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}) {
  return {
    data: {
      updateLeagueSettings: {
        __typename: 'League' as const,
        id: 1,
        name: 'Test League',
        logoUrl: patch?.logoUrl ?? null,
        bannerUrl: patch?.bannerUrl ?? null,
        primaryColor: patch?.primaryColor ?? null,
        secondaryColor: patch?.secondaryColor ?? null,
      },
    },
  };
}

// ── Join League by Code mock factories ────────────────────────────

export interface MockInviteCodeInfo {
  __typename: 'InviteCodeInfo';
  leagueId: number;
  leagueName: string;
  totalSpots: number;
  availableSpots: number;
  isFull: boolean;
  isAlreadyMember: boolean;
}

export function mockInviteCodeInfo(
  overrides: Partial<MockInviteCodeInfo> = {},
): MockInviteCodeInfo {
  return {
    __typename: 'InviteCodeInfo',
    leagueId: 1,
    leagueName: 'Test League',
    totalSpots: 10,
    availableSpots: 4,
    isFull: false,
    isAlreadyMember: false,
    ...overrides,
  };
}

/** Mock response for ValidateInviteCode query — valid, available league. */
export function validateInviteCodeResponse(info?: Partial<MockInviteCodeInfo>) {
  return { data: { validateInviteCode: mockInviteCodeInfo(info) } };
}

/** Mock response for ValidateInviteCode query — unknown/invalid code. */
export function validateInviteCodeNotFoundResponse() {
  return { data: { validateInviteCode: null } };
}

/** Mock response for JoinLeagueByCode mutation — successful join. */
export function joinLeagueByCodeResponse(leagueId = 999, teamId = 42) {
  return {
    data: {
      joinLeagueByCode: {
        __typename: 'Team' as const,
        id: teamId,
        name: 'My Test Team',
        leagueId,
      },
    },
  };
}

// ── Public League Discovery mock factories ────────────────────────

export interface MockPublicLeague {
  __typename: 'PublicLeagueInfo';
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  draftStatus: string;
  playerPool: string;
  isPublic: boolean;
  totalSpots: number;
  availableSpots: number;
  isFull: boolean;
  isAlreadyMember: boolean;
}

export function mockPublicLeague(
  overrides: Partial<MockPublicLeague> = {},
): MockPublicLeague {
  return {
    __typename: 'PublicLeagueInfo',
    id: 1,
    name: 'Public Test League',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'not-started',
    playerPool: 'all',
    isPublic: true,
    totalSpots: 10,
    availableSpots: 6,
    isFull: false,
    isAlreadyMember: false,
    ...overrides,
  };
}

/** Mock response for GetPublicLeagues query. */
export function publicLeaguesResponse(leagues?: Partial<MockPublicLeague>[]) {
  return {
    data: {
      publicLeagues: (leagues ?? [{}]).map((l) => mockPublicLeague(l)),
    },
  };
}

/** Mock response for GetPublicLeagues query — empty results. */
export function publicLeaguesEmptyResponse() {
  return { data: { publicLeagues: [] } };
}

/** Mock response for JoinPublicLeague mutation — successful join. */
export function joinPublicLeagueResponse(leagueId = 1) {
  return {
    data: {
      joinPublicLeague: {
        __typename: 'JoinLeaguePayload' as const,
        success: true,
        message: 'Successfully joined the league!',
        leagueId,
        teamId: 42,
      },
    },
  };
}

/** Mock response for JoinPublicLeague mutation — error. */
export function joinPublicLeagueErrorResponse(message = 'Failed to join') {
  return {
    data: {
      joinPublicLeague: {
        __typename: 'JoinLeaguePayload' as const,
        success: false,
        message,
        leagueId: null,
        teamId: null,
      },
    },
  };
}

// ── Season progression factories ──────────────────────────────────

export type MockLeaguePhase =
  | 'pre_season'
  | 'regular_season'
  | 'playoffs'
  | 'off_season';

export interface MockLeagueAtWeek extends MockLeague {
  currentWeek: number;
  totalWeeks: number;
  phase: MockLeaguePhase;
}

/**
 * League state at a specific week of the season.
 *
 * Automatically derives phase from the week number:
 * - Week 0 = pre_season
 * - Week 1..totalWeeks = regular_season
 * - Beyond totalWeeks = off_season (unless overridden to playoffs)
 */
export function mockLeagueAtWeek(
  week: number,
  totalWeeks = 22,
  overrides: Partial<MockLeagueAtWeek> = {},
): MockLeagueAtWeek {
  let phase: MockLeaguePhase;
  if (week <= 0) {
    phase = 'pre_season';
  } else if (week <= totalWeeks) {
    phase = 'regular_season';
  } else {
    phase = 'off_season';
  }

  return {
    ...mockLeague({
      currentMatchup: week > 0 ? week : null,
      draftStatus: week > 0 ? 'completed' : 'not-started',
      startDate: '2025-03-27',
      ...overrides,
    }),
    currentWeek: week,
    totalWeeks,
    phase: overrides.phase ?? phase,
  };
}

/** League with the playoff phase active. */
export function mockLeagueInPlayoffs(
  overrides: Partial<MockLeagueAtWeek> = {},
): MockLeagueAtWeek {
  return mockLeagueAtWeek(23, 22, {
    phase: 'playoffs',
    draftStatus: 'completed',
    startDate: '2025-03-27',
    ...overrides,
  });
}

// ── Season progression response factories ─────────────────────────

export function leagueAtWeekResponse(
  week: number,
  totalWeeks?: number,
  overrides?: Partial<MockLeagueAtWeek>,
) {
  return { data: { league: mockLeagueAtWeek(week, totalWeeks, overrides) } };
}

export function leagueInPlayoffsResponse(
  overrides?: Partial<MockLeagueAtWeek>,
) {
  return { data: { league: mockLeagueInPlayoffs(overrides) } };
}
