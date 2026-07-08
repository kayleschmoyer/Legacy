/**
 * Lineup Editor E2E Tests (LS-5360)
 *
 * Covers the Lineup Editor on the web Team Detail page
 * (/baseball/teams/:teamId): moving a player from the bench into an open
 * lineup slot, and moving a starter back to the bench. Both interactions
 * fire the underlying lineup mutation and are reflected in the UI.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const TEAM_URL = '/baseball/teams/1';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: '',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 1,
  numberOfTeams: 4,
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
  inviteCode: 'TEST1234',
  userMembership: {
    __typename: 'LeagueMember',
    leagueId: 1,
    userId: 1,
    teamId: 1,
    permissionLevel: 'owner',
    username: 'testuser',
  },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

const MOCK_TEAM = {
  __typename: 'Team',
  id: 1,
  name: 'Sluggers',
  owner: 1,
  leagueId: 1,
  waiverOrder: 1,
  faabBudget: 100,
  avatarUrl: null,
  bannerUrl: null,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
};

/** A single "1B" slot — the only configured lineup slot for these tests. */
const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
];

function mockMember(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TeamMember',
    id: 1,
    playerId: 101,
    positionId: null,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    // No eligiblePositions data — treated as universally eligible so the
    // test doesn't depend on the ALLOWED_POSITIONS eligibility table.
    player: {
      __typename: 'Player',
      id: 101,
      firstName: 'Babe',
      lastName: 'Ruth',
      brefId: 'ruthba01',
      eligiblePositions: [],
      seasonsPlayed: 22,
      careerBatting: { games: 2503, __typename: 'CareerBatting' },
    },
    ...overrides,
  };
}

interface SetupOptions {
  teamMembers?: ReturnType<typeof mockMember>[];
  userTeamId?: number;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { teamMembers = [mockMember()], userTeamId = 1 } = opts;

  // Mutable so a mocked mutation response can update what subsequent
  // getTeamMembers refetches return, mirroring the real server round-trip.
  let currentMembers = teamMembers;

  await page.route(isGraphQLEndpoint, async (route) => {
    const operationName = extractOperationName(route).toLowerCase();
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };

    if (operationName === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: currentMembers } }),
      });
    } else if (operationName === 'getteambyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { teamById: { ...MOCK_TEAM, managerId: MOCK_TEAM.owner } },
        }),
      });
    } else if (operationName === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: [MOCK_TEAM] } }),
      });
    } else if (operationName === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId } }),
      });
    } else if (operationName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operationName === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operationName === 'updateteammemberposition') {
      const { teamMemberId, positionId } = body.variables ?? {};
      currentMembers = currentMembers.map((m) =>
        m.id === teamMemberId ? { ...m, positionId: positionId ?? null } : m,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateTeamMemberPosition: {
              __typename: 'TeamMember',
              id: teamMemberId,
              positionId: positionId ?? null,
            },
          },
        }),
      });
    } else if (operationName === 'getteamleaguemembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamLeagueMembers: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Lineup Editor — GM assigns and benches a player @regression', () => {
  test('moving a bench player into an open lineup slot fires the mutation and updates the UI', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: null })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // Starts on the bench, the 1B slot is open ("1st Base" is the slot's
    // human-readable label — see getPositionLabel in rosterEligibility.ts).
    await expect(page.getByTestId('roster-section-bench')).toContainText(
      'Babe Ruth',
    );
    await expect(
      page.getByRole('button', { name: /1st base — open slot/i }),
    ).toBeVisible();

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );

    // Select the bench player, then tap the now-eligible 1B slot to assign
    // them — selecting a player changes the open slot's aria-label from
    // "1st Base — open slot" to "Assign Babe Ruth to 1B".
    await page.getByRole('button', { name: /babe ruth — bench/i }).click();
    await page.getByRole('button', { name: /assign babe ruth to 1b/i }).click();
    await mutationRequest;

    // The player now shows in the 1B slot; the bench section no longer
    // lists them.
    await expect(
      page.getByRole('button', { name: /babe ruth at 1b/i }),
    ).toBeVisible();
    await expect(page.getByTestId('roster-section-bench')).not.toContainText(
      'Babe Ruth',
    );
  });

  test('moving a starter back to the bench fires the mutation and updates the UI', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: 2 })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const startingSlot = page.getByRole('button', { name: /babe ruth at 1b/i });
    await expect(startingSlot).toBeVisible();

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );

    // Select the starter, then use "Move ... to bench".
    await startingSlot.click();
    await page
      .getByRole('button', { name: /move babe ruth to bench/i })
      .click();
    await mutationRequest;

    await expect(page.getByTestId('roster-section-bench')).toContainText(
      'Babe Ruth',
    );
    await expect(
      page.getByRole('button', { name: /1st base — open slot/i }),
    ).toBeVisible();
  });
});

test.describe('Lineup Editor — visitor sees a read-only board @regression', () => {
  test('a visitor cannot select a player to edit the lineup', async ({
    page,
  }) => {
    // Owned by team 2, so the viewer (team 1) is a visitor here.
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: 2 })],
      userTeamId: 2,
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const startingSlot = page.getByRole('button', { name: /babe ruth at 1b/i });
    await expect(startingSlot).toBeVisible();
    await expect(startingSlot).toHaveAttribute('tabindex', '-1');
    // Read-only slots render as genuinely disabled buttons, so a normal
    // click is refused by Playwright's actionability checks — assert the
    // disabled state directly rather than attempting to click through it.
    await expect(startingSlot).toBeDisabled();

    // No selection banner appears and no "Move to bench" action becomes
    // available, since nothing can be selected in read-only mode.
    await expect(
      page.getByRole('button', { name: /move babe ruth to bench/i }),
    ).toHaveCount(0);
  });
});
