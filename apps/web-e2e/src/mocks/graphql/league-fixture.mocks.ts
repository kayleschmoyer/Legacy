/**
 * League + member GraphQL mock data factory — the "seeded league" precondition
 * ladder (LS-9736, seam-extension-list rank #2:
 * `docs/dev-process/e2e-dual-mode-migration-matrix.md`).
 *
 * {@link createLeagueFixture} is the mock-mode analogue of
 * {@link createFootballLineupFixture} (`roster.mocks.ts`): it owns a mutable
 * league record (the league itself, plus whichever teams have joined it) and
 * exposes an operation-name-keyed handler map. Two independent
 * `page.route()` installations — one per Playwright `Page` — can point at the
 * SAME {@link LeagueFixture} instance, so a write made through one page's
 * handlers (e.g. `joinLeagueByCode` adding a member) is visible to the other
 * page's subsequent reads (e.g. `GetLeagueTeams`). This is what makes the
 * multi-actor dual fixtures (`fixtures/dual.ts`'s
 * `counterpartyPage`/`counterpartyTestData`) and the
 * `TestData.league()`/`leagueWithMember()` verbs compose — see
 * `fixtures/test-data.ts`'s `DualMockState`, which hands the SAME fixture to
 * both pages' `MockTestData` instances.
 *
 * This module is payload-only: it never imports from `fixtures/`, matching
 * the same layering `roster.mocks.ts` documents for the native mock server.
 */
import type { MockOperationResponder } from './roster.mocks';
import {
  createLeagueResponse,
  joinLeagueByCodeResponse,
  leagueByIdResponse,
  leagueTeamsResponse,
  type MockLeague,
  userLeaguesResponse,
  userTeamIdResponse,
  validateInviteCodeResponse,
} from './league.mocks';

/**
 * Monotonic per-process counter for default league ids/invite codes. Two
 * separately-constructed fixtures are therefore always distinguishable — the
 * property the dual-mode proof-of-concept spec relies on to demonstrate that
 * `counterpartyTestData.league()` observes the SAME fixture the primary
 * `testData.leagueWithMember()` created, rather than each page silently
 * building its own.
 */
let nextLeagueId = 9_000;

export interface LeagueFixtureMember {
  readonly userId: number;
  readonly teamId: number;
  readonly teamName: string;
  readonly permissionLevel: string;
}

export interface LeagueFixtureOptions {
  leagueName?: string;
  commissionerUserId?: number;
  commissionerTeamId?: number;
}

export interface LeagueFixture {
  readonly leagueId: number;
  readonly inviteCode: string;
  readonly leagueName: string;
  /** The commissioner — always `members()[0]`. */
  readonly commissioner: LeagueFixtureMember;
  /** The league's members right now — the ladder's verbs mutate this. */
  members(): readonly LeagueFixtureMember[];
  /**
   * Register a joined member. Called directly by `TestData.leagueWithMember()`
   * to pre-seed the base ladder's second identity, and by the
   * `joinLeagueByCode` handler below when a spec drives the real join UI.
   */
  addMember(overrides?: {
    teamName?: string;
    userId?: number;
    teamId?: number;
  }): LeagueFixtureMember;
  /** Lowercased GraphQL operation name → response-body builder. */
  readonly handlers: Readonly<Record<string, MockOperationResponder>>;
}

/**
 * Build the seeded-league precondition: a league the commissioner owns,
 * mutable enough that `joinLeagueByCode` and `createLeagueAndTeams` behave
 * statefully for whichever spec exercises them.
 *
 * The returned `handlers` map is the whole point — it holds the stateful
 * membership logic so a join round-trips through a refetch identically
 * whether it's driven from the page that created the league or from a second
 * page sharing the same fixture (mirrors `createFootballLineupFixture`'s
 * rationale for a single page).
 */
export function createLeagueFixture(
  options: LeagueFixtureOptions = {},
): LeagueFixture {
  const leagueId = nextLeagueId++;
  const leagueName = options.leagueName ?? `Dual Mode League ${leagueId}`;
  const inviteCode = `DUAL${leagueId}`;

  const commissioner: LeagueFixtureMember = {
    userId: options.commissionerUserId ?? 1,
    teamId: options.commissionerTeamId ?? 1,
    teamName: 'Commissioner Team',
    permissionLevel: 'owner',
  };
  let members: LeagueFixtureMember[] = [commissioner];
  let nextTeamId = commissioner.teamId + 1;
  let nextUserId = commissioner.userId + 1;

  function addMember(
    overrides: { teamName?: string; userId?: number; teamId?: number } = {},
  ): LeagueFixtureMember {
    const member: LeagueFixtureMember = {
      userId: overrides.userId ?? nextUserId++,
      teamId: overrides.teamId ?? nextTeamId++,
      teamName: overrides.teamName ?? `Member Team ${members.length}`,
      permissionLevel: 'general_manager',
    };
    members = [...members, member];
    return member;
  }

  function currentLeague(): Partial<MockLeague> {
    return {
      id: leagueId,
      name: leagueName,
      inviteCode,
      numberOfTeams: 10,
      userMembership: {
        __typename: 'LeagueMember',
        leagueId,
        userId: commissioner.userId,
        teamId: commissioner.teamId,
        permissionLevel: commissioner.permissionLevel,
        username: 'commissioner',
      },
    };
  }

  const handlers: Record<string, MockOperationResponder> = {
    createleagueandteams: () =>
      createLeagueResponse({ id: leagueId, name: leagueName, inviteCode }),
    getleaguebyid: () => leagueByIdResponse(currentLeague()),
    getuserleagues: () => userLeaguesResponse([currentLeague()]),
    getleagueteams: () =>
      leagueTeamsResponse(
        members.map((member) => ({
          id: member.teamId,
          name: member.teamName,
          owner: member.userId,
        })),
      ),
    getuserteamid: () => userTeamIdResponse(commissioner.teamId),
    validateinvitecode: () =>
      validateInviteCodeResponse({
        leagueId,
        leagueName,
        totalSpots: 10,
        availableSpots: Math.max(0, 10 - members.length),
        isFull: members.length >= 10,
        isAlreadyMember: false,
      }),
    joinleaguebycode: (variables) => {
      const requestedTeamName = variables['teamName'];
      const teamName =
        typeof requestedTeamName === 'string' && requestedTeamName
          ? requestedTeamName
          : `Member Team ${members.length}`;
      const member = addMember({ teamName });
      return joinLeagueByCodeResponse(leagueId, member.teamId);
    },
  };

  return {
    leagueId,
    inviteCode,
    leagueName,
    commissioner,
    members: () => members,
    addMember,
    handlers,
  };
}
