/**
 * Create League (Football) — Post-Creation Team Setup & Redirect (LS-5377)
 *
 * QA-coverage Feature Story LS-5377 under the Create League — Football page
 * epic (LS-5263). Covers the journey that starts at a valid submit on
 * `/football/league/create` and ends on the new league's detail page:
 *
 *   submit → "League created!" invite-code dialog (LS-6067, gates navigation)
 *          → "Continue to League"
 *          → /football/league/:newId rendering the owner's team, the
 *            commissioner role, and the initialized pre-draft state.
 *
 * The pre-existing football coverage stops at a URL regex
 * (`league-creation-football.spec.ts`, `football-hub.spec.ts`); this spec is
 * the dedicated Feature Story spec and additionally proves the interstitial
 * gate, that the mutation carries the user's entered settings, and that the
 * destination reflects the post-creation team setup.
 *
 * Hermetic — every GraphQL operation is mocked via `route.fulfill()`. The
 * ambient league-detail queries come from `BASELINE_GRAPHQL_RESPONSES`; only
 * the create mutation and the three reads that must describe *this* league
 * (`GetLeagueById`, `GetLeagueTeams`, `GetUserTeamId`) are overridden here.
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — this spec is selector-free.
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import { enableFootball } from '../fixtures/shared-mocks';
import {
  createLeagueResponse,
  mockLeague,
} from '../mocks/graphql/league.mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Fixture data ─────────────────────────────────────────────────────────

/** Id the mocked `createLeagueAndTeams` returns — the id the redirect must use. */
const CREATED_LEAGUE_ID = 4242;
const LEAGUE_NAME = 'Gridiron Dynasty';
const INVITE_CODE = 'FBQA5377';
/** Non-default team count, so the assertion proves the user's pick was sent. */
const TEAM_COUNT = 10;

/**
 * The owner's team. `LeagueService.createLeague` names the first team
 * `<displayName>'s Team` from the authenticated username, and the hermetic
 * identity is `testuser` (the profile api-isolation seeds into localStorage).
 */
const OWNER_TEAM_NAME = "testuser's Team";
const SECOND_TEAM_NAME = 'Blitz Brigade';

/**
 * The league as the detail page reads it back after creation. Without `sport`
 * the hero renders the league as baseball. `defensiveFormat` is on the
 * `League` fragment but not on `MockLeague`, so it is spread on.
 */
const CREATED_LEAGUE = {
  ...mockLeague({
    id: CREATED_LEAGUE_ID,
    name: LEAGUE_NAME,
    sport: 'football',
    // `owner === user.id` is what the detail page derives `isCommissioner`
    // from; the hermetic user is id 1 (api-isolation's seeded profile).
    owner: 1,
    numberOfTeams: TEAM_COUNT,
    // A freshly created league always has a draft record but no picks yet —
    // the "Pre-Draft" chip is the rendered form of that state.
    draftStatus: 'not-started',
    inviteCode: INVITE_CODE,
  }),
  defensiveFormat: 'dst',
};

/**
 * Teams as `createLeagueAndTeams` seeds them: the owner's team first, then
 * the placeholder teams that fill out the league.
 *
 * Every field `GetLeagueTeams` selects must be present — Apollo drops a
 * partial entity, which renders the detail page's Standings card empty
 * rather than failing the query outright.
 */
function mockLeagueTeam(id: number, name: string, managerId: number | null) {
  return {
    __typename: 'Team',
    id,
    name,
    leagueId: CREATED_LEAGUE_ID,
    waiverOrder: id,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId,
  };
}

const CREATED_TEAMS = [
  mockLeagueTeam(1, OWNER_TEAM_NAME, 1),
  mockLeagueTeam(2, SECOND_TEAM_NAME, null),
];

// ── Mocks ────────────────────────────────────────────────────────────────

/** Captured `createLeagueAndTeams` input, for asserting the submitted values. */
interface CapturedCreateInput {
  input: Record<string, unknown> | null;
}

/**
 * Route the create mutation plus the three league-detail operations that must
 * describe the newly created league. Returns the capture cell so a test can
 * assert on the submitted mutation input.
 */
async function mockCreateAndDetail(
  page: import('@playwright/test').Page,
): Promise<CapturedCreateInput> {
  const captured: CapturedCreateInput = { input: null };

  await createGraphQLRouter(page, {
    createleagueandteams: (route, { variables }) => {
      captured.input =
        (variables.input as Record<string, unknown> | undefined) ?? null;
      return fulfillJson(route, createLeagueResponse(CREATED_LEAGUE));
    },
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: CREATED_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: CREATED_TEAMS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
  });

  return captured;
}

// ── Journey ──────────────────────────────────────────────────────────────

/**
 * Fill the minimum valid football league and submit. Stops at the
 * "League created!" dialog — navigation is a separate, deliberate step.
 */
async function submitValidFootballLeague(
  leaguePage: import('../pages/league.page').LeaguePage,
): Promise<void> {
  await leaguePage.gotoCreate('football');
  await leaguePage.fillLeagueName(LEAGUE_NAME);
  await leaguePage.selectTeamCount(TEAM_COUNT);
  await leaguePage.submitCreate();
}

test.describe('Create League (Football) — Post-Creation Team Setup & Redirect @regression', () => {
  // The football sport tab is gated behind `football_enabled` (LS-4767, off in
  // CI). Seed it before any navigation so the football create form renders.
  test.beforeEach(async ({ page }) => {
    await enableFootball(page);
  });

  test('a valid submit opens the "League created!" dialog with the invite code and does not navigate yet', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateAndDetail(page);

    await submitValidFootballLeague(leaguePage);

    await leaguePage.leagueCreatedDialog.expectVisible({ timeout: 15_000 });
    await leaguePage.leagueCreatedDialog.expectContainsText(INVITE_CODE);

    // The dialog gates the redirect — the user is still on the create form.
    await expect(page).toHaveURL('/football/league/create');
  });

  test('the createLeagueAndTeams mutation carries the entered name, sport, and team count', async ({
    page,
    leaguePage,
  }) => {
    const captured = await mockCreateAndDetail(page);

    await submitValidFootballLeague(leaguePage);
    await leaguePage.leagueCreatedDialog.expectVisible({ timeout: 15_000 });

    // This is the call that seeds the owner's team, the roster positions, and
    // the draft record server-side — it must carry what the user chose.
    expect(captured.input?.leagueName).toBe(LEAGUE_NAME);
    expect(captured.input?.sport).toBe('football');
    expect(captured.input?.numberOfTeams).toBe(TEAM_COUNT);
  });

  test('"Continue to League" redirects to the new league id under /football', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateAndDetail(page);

    await submitValidFootballLeague(leaguePage);
    await leaguePage.leagueCreatedDialog.expectVisible({ timeout: 15_000 });
    await leaguePage.continueToLeague();

    // The id comes from the mutation payload, not from the form.
    await expect(page).toHaveURL(`/football/league/${CREATED_LEAGUE_ID}`);
  });

  test("the landing page shows the new league with the owner's team and commissioner role", async ({
    page,
    leaguePage,
  }) => {
    await mockCreateAndDetail(page);

    await submitValidFootballLeague(leaguePage);
    await leaguePage.leagueCreatedDialog.expectVisible({ timeout: 15_000 });
    await leaguePage.continueToLeague();

    await leaguePage.leagueTitle.expectContainsText(LEAGUE_NAME, {
      timeout: 15_000,
    });

    // The owner's team was created alongside the league and is listed on the
    // league the commissioner just landed on.
    await leaguePage.teamStandingsRow(OWNER_TEAM_NAME).expectVisible();
    await leaguePage.teamStandingsRow(SECOND_TEAM_NAME).expectVisible();

    // The commissioner-only tab renders only for a commissioner — the
    // creating user holds commissioner permission on the league they made.
    await leaguePage.commissionerTab.expectVisible();
    await leaguePage.expectNoAppError();
  });

  test('the landing page shows the league in its initialized pre-draft state', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateAndDetail(page);

    await submitValidFootballLeague(leaguePage);
    await leaguePage.leagueCreatedDialog.expectVisible({ timeout: 15_000 });
    await leaguePage.continueToLeague();

    await leaguePage.leagueTitle.expectContainsText(LEAGUE_NAME, {
      timeout: 15_000,
    });

    // draftStatus 'not-started' renders as the "Pre-Draft" chip: the draft
    // record exists and is awaiting setup, rather than being absent.
    await leaguePage.draftStatusChip.expectVisible();
    await leaguePage.draftStatusChip.expectContainsText('Pre-Draft');
    await leaguePage.expectNoAppError();
  });
});
