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
