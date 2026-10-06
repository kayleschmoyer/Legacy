/**
 * Roster / lineup GraphQL mock data factories (LS-9655).
 *
 * Covers: `teamMembers`, football-shaped `leaguePositions`, and the two lineup
 * mutations (`updateTeamMemberPosition`, `swapTeamMemberPositions`) — the
 * payload gap that forced the football roster spec to hand-roll ~140 lines of
 * inline literals.
 *
 * The football lineup *scenario* — a league the viewer owns a team in, one
 * configured starting slot, and an eligible bench player — is assembled by
 * {@link createFootballLineupFixture}. It owns the mutable roster state and
 * exposes an operation-name-keyed handler map, so the web route mocks
 * (`MockTestData.footballLineup`) and the native mock server
 * (`NativeMockTestData.footballLineup`) serve the SAME payloads and replay the
 * SAME assignment round-trip — no forked fixtures (ADR-0017 AC2).
 *
 * This module is payload-only: it never imports from `fixtures/`, so the
 * `mocks → fixtures` cycle the native mock server documents stays impossible.
 */
import {
  type MockLeague,
  mockLeague,
  type MockTeam,
  mockTeam,
  userTeamIdResponse,
  viewerMembershipResponse,
} from './league.mocks';

// ── Roster player + team member ─────────────────────────────────────

/** The `careerBatting { games }` selection carried by the TeamMember fragment. */
export interface MockRosterCareerBatting {
  __typename: 'CareerBatting';
  games: number;
}

/** The `player { … }` selection inside the TeamMember/AppTeamMember fragments. */
export interface MockRosterPlayer {
  __typename: 'Player';
  id: number;
  firstName: string;
  lastName: string;
  brefId: string | null;
  eligiblePositions: string[];
  mlbTeam: string | null;
  nflTeam: string | null;
  jerseyNumber: number | null;
  seasonsPlayed: number;
  careerBatting: MockRosterCareerBatting | null;
}

export function mockRosterPlayer(
  overrides: Partial<MockRosterPlayer> = {},
): MockRosterPlayer {
  return {
    __typename: 'Player',
    id: 901,
    firstName: 'Josh',
    lastName: 'Allen',
    brefId: null,
    eligiblePositions: ['QB'],
    mlbTeam: null,
    nflTeam: 'BUF',
    jerseyNumber: 17,
    seasonsPlayed: 7,
    careerBatting: null,
    ...overrides,
  };
}

/** A rostered player — the union of the TeamMember + AppTeamMember fragments. */
export interface MockTeamMember {
  __typename: 'TeamMember';
  id: number;
  playerId: number;
  /** `null` = benched; a `LeaguePosition.id` = starting in that slot. */
  positionId: number | null;
  teamId: number;
  leagueId: number;
  onTradeBlock: boolean;
  salary: number | null;
  askingPrice: string | null;
  nickname: string | null;
  isLocked: boolean;
  player: MockRosterPlayer;
}

export function mockTeamMember(
  overrides: Partial<MockTeamMember> = {},
): MockTeamMember {
  const { player, ...rest } = overrides;
  return {
    __typename: 'TeamMember',
    id: 201,
    playerId: 901,
    positionId: null,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    askingPrice: null,
    nickname: null,
    isLocked: false,
    player: mockRosterPlayer(player),
    ...rest,
  };
}

/** Mock response for the `GetTeamMembers` query. */
export function teamMembersResponse(members?: MockTeamMember[]) {
  return { data: { teamMembers: members ?? [mockTeamMember()] } };
}

// ── Football league positions ───────────────────────────────────────

/**
 * A football starting slot. Note the shape differs from baseball's
 * {@link import('./league.mocks').MockPosition} (`name`/`abbrev`): the football
 * surface reads `positionType` off the `LeaguePosition` fragment.
 */
export interface MockFootballPosition {
  __typename: 'LeaguePosition';
  id: number;
  leagueId: number;
  positionType: string;
}

/** A standard NFL starting slate, in render order. */
export const DEFAULT_FOOTBALL_POSITION_TYPES: readonly string[] = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'K',
  'DEF',
];

export function mockFootballPosition(
  overrides: Partial<MockFootballPosition> = {},
): MockFootballPosition {
  return {
    __typename: 'LeaguePosition',
    id: 1,
    leagueId: 1,
    positionType: 'QB',
    ...overrides,
  };
}

/** Football-shaped set of league positions; ids are assigned 1..n in order. */
export function mockFootballPositions(
  positionTypes: readonly string[] = DEFAULT_FOOTBALL_POSITION_TYPES,
  leagueId = 1,
): MockFootballPosition[] {
  return positionTypes.map((positionType, index) =>
    mockFootballPosition({ id: index + 1, leagueId, positionType }),
  );
}

/** Mock response for `GetPositionsForLeague` in a football league. */
export function footballPositionsResponse(positions?: MockFootballPosition[]) {
  return { data: { leaguePositions: positions ?? mockFootballPositions() } };
}

// ── NFL team season metadata (bye weeks) ────────────────────────────

/** A row of the `nflTeamSeasonMetadata` query (LS-6441 bye-week scenario). */
export interface MockNflTeamSeasonMetadata {
  __typename: 'NflTeamSeasonMetadata';
  teamAbbreviation: string;
  byeWeek: number;
  sosTier: string | null;
  season: number;
}

/**
 * Mock response for `GetNflTeamSeasonMetadata`, keyed by NFL team
 * abbreviation → bye week number. Empty by default, matching the football
 * lineup fixture's pre-LS-6441 behaviour (no team ever on bye).
 */
export function nflTeamSeasonMetadataResponse(
  byeWeeksByTeam: Readonly<Record<string, number>> = {},
) {
  const nflTeamSeasonMetadata: MockNflTeamSeasonMetadata[] = Object.entries(
    byeWeeksByTeam,
  ).map(([teamAbbreviation, byeWeek]) => ({
    __typename: 'NflTeamSeasonMetadata',
    teamAbbreviation,
    byeWeek,
    sosTier: null,
    season: 1,
  }));
  return { data: { nflTeamSeasonMetadata } };
}

// ── Team, as selected by GetLeagueTeams ─────────────────────────────

/**
 * {@link MockTeam} plus the extra fields `GetLeagueTeams` selects. Built on the
 * shared `mockTeam` factory rather than forking it, so the baseline team shape
 * stays the single source of id/name/owner.
 */
export interface MockRosterTeam extends MockTeam {
  leagueId: number;
  waiverOrder: number | null;
  faabBudget: number | null;
  isLocked: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  avatarUrl: string | null;
}

export function mockRosterTeam(
  overrides: Partial<MockRosterTeam> = {},
): MockRosterTeam {
  return {
    ...mockTeam(),
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    ...overrides,
  };
}

/**
 * {@link MockRosterTeam} plus the remaining `Team` fragment fields and the
 * `managerId` that `GetTeamById` selects on top of it. Team Detail (web
 * `pages/football/FootballTeamDetailPage.tsx`, native
 * `app/(app)/(tabs)/(home,leagues,players,games,you)/football/team/[teamId].tsx`) is driven by that query rather than
 * by `GetLeagueTeams`, and native treats a null `team` as a hard "Could not
 * load team" — so the fixture has to answer it with a real row.
 */
export interface MockTeamById extends MockRosterTeam {
  bannerUrl: string | null;
  totalPayroll: number | null;
  capSpace: number | null;
  managerId: number | null;
}

export function mockTeamById(
  overrides: Partial<MockTeamById> = {},
): MockTeamById {
  const base = mockRosterTeam(overrides);
  return {
    ...base,
    bannerUrl: null,
    totalPayroll: null,
    capSpace: null,
    // The team's manager is its owner unless a scenario says otherwise.
    managerId: base.owner,
    ...overrides,
  };
}

/** Mock response for the `GetTeamById` query (aliased `team: teamById`). */
export function teamByIdResponse(team?: Partial<MockTeamById>) {
  return { data: { team: mockTeamById(team) } };
}

// ── Lineup mutation response factories ──────────────────────────────

/** Mock response for the `UpdateTeamMemberPosition` mutation. */
export function updateTeamMemberPositionResponse(member: MockTeamMember) {
  return { data: { updateTeamMemberPosition: member } };
}

/**
 * Mock response for the `SwapTeamMemberPositions` mutation. The schema returns
 * a *list* of the affected members, so both sides of the swap come back.
 */
export function swapTeamMemberPositionsResponse(members: MockTeamMember[]) {
  return { data: { swapTeamMemberPositions: members } };
}

// ── The football lineup scenario ────────────────────────────────────

/** Builds a response body from a GraphQL operation's parsed variables. */
export type MockOperationResponder = (
  variables: Record<string, unknown>,
) => unknown;

export interface FootballLineupFixtureOptions {
  leagueId?: number;
  teamId?: number;
  leagueName?: string;
  teamName?: string;
  /**
   * Starting slots to configure, in render order. Defaults to a single QB slot
   * so the "one open slot, one eligible bench player" scenario stays
   * unambiguous.
   */
  positionTypes?: readonly string[];
  /** Roster to start from. Defaults to one benched, QB-eligible player. */
  members?: MockTeamMember[];
  /**
   * The league's active week, served as `League.currentWeekNumber` (LS-6441
   * bye-week scenario — `RosterBoard`'s `onBye` computation compares a
   * player's NFL team's bye week against this). Defaults to `undefined`, i.e.
   * whatever {@link mockLeague}'s own default is (`null` → the Roster tab
   * treats it as week 1) — unchanged from the pre-LS-6441 fixture.
   */
  currentWeekNumber?: number;
  /**
   * NFL team abbreviation → bye week number, served by
   * `GetNflTeamSeasonMetadata` (LS-6441 bye-week scenario). Empty by default —
   * the pre-LS-6441 fixture never had a team on bye.
   */
  byeWeeksByTeam?: Readonly<Record<string, number>>;
  /**
   * The team the VIEWER owns in this league, served as both `userTeamId` and
   * `viewerMembership.teamId` (LS-9657 Team Detail scenario). Defaults to
   * {@link FootballLineupFixtureOptions.teamId} — i.e. the viewer owns the
   * team under test, which is what every League-Roster-tab scenario wants,
   * since that tab only ever renders the viewer's own team.
   *
   * Point it at a DIFFERENT team id to build the Team Detail visitor
   * precondition: both platforms' edit gates compare the viewer's own team
   * against the team being viewed (web `FootballTeamDetailPage`'s
   * `isOwner`/`isGM`, native `[teamId].tsx`'s `isOwner`), so a mismatch is
   * exactly what renders `RosterBoard` read-only.
   */
  viewerTeamId?: number;
  /**
   * The viewer's `viewerMembership.permissionLevel`. Defaults to
   * `'general_manager'` — the level web's Team Detail edit gate requires
   * (`'owner'` is NOT one of them; see `FootballTeamDetailPage`'s `isGM`).
   */
  viewerPermissionLevel?: string;
}

export interface FootballLineupFixture {
  readonly leagueId: number;
  readonly teamId: number;
  readonly league: MockLeague;
  readonly teams: MockRosterTeam[];
  readonly positions: MockFootballPosition[];
  /** The first configured starting slot — empty until a player is assigned. */
  readonly openSlot: { positionId: number; positionType: string };
  /** The first benched player on the roster, eligible for {@link openSlot}. */
  readonly benchPlayer: {
    teamMemberId: number;
    playerId: number;
    fullName: string;
  };
  /** The roster as it stands right now — the lineup mutations mutate it. */
  members(): MockTeamMember[];
  /** Lowercased GraphQL operation name → response-body builder. */
  readonly handlers: Readonly<Record<string, MockOperationResponder>>;
}

/**
 * Coerce a required GraphQL `Int` variable, failing loudly on anything that is
 * not an integer id. A real resolver rejects a bad id outright; letting `NaN`
 * through instead would make `assignPosition` silently match nothing and
 * surface much later as a confusing assertion failure.
 */
function toId(value: unknown, fieldName: string): number {
  const id =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(id)) {
    throw new Error(
      `createFootballLineupFixture: \`${fieldName}\` must be an integer id, ` +
        `received ${JSON.stringify(value)}.`,
    );
  }
  return id;
}

/**
 * Coerce a GraphQL `Int` variable that is nullable in the schema. `null` (and
 * an omitted variable) is meaningful here — it is how the surface benches a
 * player — so it passes through; anything else must still be a valid id.
 */
function toNullableId(value: unknown, fieldName: string): number | null {
  return value == null ? null : toId(value, fieldName);
}

/**
 * Build the football lineup precondition: a football league whose viewer owns
 * a team, one configured starting slot, and an eligible bench player.
 *
 * The returned `handlers` map is the whole point — it holds the stateful
 * assignment logic that used to live inline in
 * `tests/football-roster-lineup.spec.ts`, so a lineup mutation round-trips
 * through a refetch identically whether it is served by `page.route()` (web) or
 * by the in-process native mock server.
 */
export function createFootballLineupFixture(
  options: FootballLineupFixtureOptions = {},
): FootballLineupFixture {
  const leagueId = options.leagueId ?? 1;
  const teamId = options.teamId ?? 1;

  const positions = mockFootballPositions(
    options.positionTypes ?? ['QB'],
    leagueId,
  );
  const league = mockLeague({
    id: leagueId,
    name: options.leagueName ?? 'Gridiron Legends',
    description: 'E2E football roster test league',
    sport: 'football',
    maxRosterSize: 16,
    draftStatus: 'completed',
    currentMatchup: 1,
    numberOfTeams: 4,
    currentWeekNumber: options.currentWeekNumber,
    userMembership: {
      __typename: 'LeagueMember',
      leagueId,
      userId: 1,
      teamId,
      permissionLevel: 'owner',
      username: 'testuser',
    },
  });
  const teams = [
    mockRosterTeam({
      id: teamId,
      leagueId,
      name: options.teamName ?? 'Steel City Blitz',
      owner: 1,
    }),
  ];
  // The viewer's own team in this league — the same id the team under test
  // carries unless a scenario deliberately separates them (the visitor case).
  const viewerTeamId = options.viewerTeamId ?? teamId;
  const viewerPermissionLevel =
    options.viewerPermissionLevel ?? 'general_manager';

  let members = options.members ?? [
    mockTeamMember({ teamId, leagueId, positionId: null }),
  ];

  /** Move one member to a slot (or to the bench with `null`); returns it. */
  function assignPosition(
    teamMemberId: number,
    positionId: number | null,
  ): MockTeamMember | undefined {
    let updated: MockTeamMember | undefined;
    members = members.map((member) => {
      if (member.id !== teamMemberId) return member;
      updated = { ...member, positionId };
      return updated;
    });
    return updated;
  }

  const openSlot = positions[0];
  // The scenario's whole point is an empty slot plus someone eligible to fill
  // it. Fabricating handles for a roster or slate that cannot satisfy that
  // would hand the spec ids pointing at nothing — fail loudly instead.
  if (!openSlot) {
    throw new Error(
      'createFootballLineupFixture: `positionTypes` must configure at least ' +
        'one starting slot — the fixture has no slot to return as `openSlot`.',
    );
  }
  const benchPlayer =
    members.find((member) => member.positionId == null) ?? members[0];
  if (!benchPlayer) {
    throw new Error(
      'createFootballLineupFixture: `members` must contain at least one ' +
        'rostered player — the fixture has no player to return as ' +
        '`benchPlayer`.',
    );
  }

  const handlers: Record<string, MockOperationResponder> = {
    getleaguebyid: () => ({ data: { league } }),
    // Not in the ticket's op list, but the surface does fire it on load — the
    // league must be visible in the viewer's league set or the shell 404s.
    getuserleagues: () => ({
      data: { userLeagues: [league], userLeagueCount: 1 },
    }),
    getpositionsforleague: () => footballPositionsResponse(positions),
    getteammembers: () => teamMembersResponse(members),
    getleagueteams: () => ({ data: { leagueTeams: teams } }),
    // Team Detail (LS-9657) is addressed by team, not by league, so it reads
    // the team row through `GetTeamById` rather than `GetLeagueTeams` — and
    // native hard-stops on a null `team`, so answer it from the same row.
    getteambyid: (variables) => {
      const requested = toId(variables['teamId'], 'teamId');
      return teamByIdResponse({
        id: requested,
        leagueId,
        name: options.teamName ?? 'Steel City Blitz',
        owner: 1,
      });
    },
    getuserteamid: () => userTeamIdResponse(viewerTeamId),
    // Web's Team Detail edit gate reads the viewer's membership row directly
    // (native derives the same thing from `GetUserTeamId` above), so both
    // have to agree about which team the viewer owns.
    getviewermembership: () =>
      viewerMembershipResponse({
        leagueId,
        teamId: viewerTeamId,
        permissionLevel: viewerPermissionLevel,
      }),
    // The Roster tab's matchup scoreline pipeline degrades gracefully on empty
    // data; pin both so neither backend falls through to the baseline.
    getmatchupplayers: () => ({ data: { getMatchupPlayers: [] } }),
    getnflteamseasonmetadata: () =>
      nflTeamSeasonMetadataResponse(options.byeWeeksByTeam),
    updateteammemberposition: (variables) => {
      const teamMemberId = toId(variables['teamMemberId'], 'teamMemberId');
      const positionId = toNullableId(variables['positionId'], 'positionId');
      const updated =
        assignPosition(teamMemberId, positionId) ??
        mockTeamMember({ id: teamMemberId, positionId, teamId, leagueId });
      return updateTeamMemberPositionResponse(updated);
    },
    swapteammemberpositions: (variables) => {
      const swapped = [
        assignPosition(
          toId(variables['teamMemberIdA'], 'teamMemberIdA'),
          toNullableId(variables['positionIdA'], 'positionIdA'),
        ),
        assignPosition(
          toId(variables['teamMemberIdB'], 'teamMemberIdB'),
          toNullableId(variables['positionIdB'], 'positionIdB'),
        ),
      ].filter((member): member is MockTeamMember => member != null);
      return swapTeamMemberPositionsResponse(swapped);
    },
  };

  return {
    leagueId,
    teamId,
    league,
    teams,
    positions,
    openSlot: {
      positionId: openSlot.id,
      positionType: openSlot.positionType,
    },
    benchPlayer: {
      teamMemberId: benchPlayer.id,
      playerId: benchPlayer.playerId,
      fullName: `${benchPlayer.player.firstName} ${benchPlayer.player.lastName}`,
    },
    members: () => members,
    handlers,
  };
}

// ── The Team Detail visitor scenario (LS-9657) ──────────────────────

/** The team id the viewer owns in {@link createFootballTeamDetailVisitorScenario}. */
export const VISITOR_VIEWER_TEAM_ID = 2;

/** The starter already in the viewed team's QB slot, for the same scenario. */
export const VISITOR_STARTER = Object.freeze({
  fullName: 'Josh Allen',
  positionType: 'QB',
});

/**
 * Build the Team Detail read-only precondition: a football team the viewer
 * does NOT own, with one player already in its only starting slot.
 *
 * Lives here (rather than inline in each `TestData` implementation) so the web
 * `page.route()` verb and the native mock-server verb construct the SAME
 * scenario from one definition — the duplication the football-lineup sibling
 * scenarios carry is a standing cost (ADR-0017 AC2), not a pattern to extend.
 */
export function createFootballTeamDetailVisitorScenario(): FootballLineupFixture {
  return createFootballLineupFixture({
    positionTypes: [VISITOR_STARTER.positionType],
    members: [
      mockTeamMember({
        id: 501,
        // The fixture's first configured slot — `mockFootballPositions` ids
        // are 1-based in receipt order.
        positionId: 1,
        player: mockRosterPlayer({
          id: 930,
          firstName: 'Josh',
          lastName: 'Allen',
          eligiblePositions: [VISITOR_STARTER.positionType],
          nflTeam: 'BUF',
        }),
      }),
    ],
    // The whole point: the viewer's own team is NOT the team being viewed.
    viewerTeamId: VISITOR_VIEWER_TEAM_ID,
  });
}
