/**
 * Team Detail Page E2E Tests (LS-602)
 *
 * Covers: team name display, roster list, visitor notice, GM branding section,
 * owner-info layout, error/loading states.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Route: /baseball/team/:teamId → tested at /baseball/team/1
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const TEAM_URL = '/baseball/team/1';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: '',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'not-started',
  currentMatchup: null,
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
    teamId: 1,
    permissionLevel: 'owner',
  },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

function mockMember(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TeamMember',
    id: 1,
    playerId: 101,
    positionId: 2,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 101,
      firstName: 'Babe',
      lastName: 'Ruth',
      brefId: 'ruthba01',
      eligiblePositions: ['OF'],
      seasonsPlayed: 22,
      careerBatting: { games: 2503, __typename: 'CareerBatting' },
    },
    ...overrides,
  };
}

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface SetupOptions {
  teamMembers?: ReturnType<typeof mockMember>[];
  userTeamId?: number;
  league?: typeof MOCK_LEAGUE;
  errorMembers?: boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    teamMembers = [mockMember()],
    userTeamId = 1,
    league = MOCK_LEAGUE,
    errorMembers = false,
  } = opts;

  const teamList = [
    {
      __typename: 'Team',
      id: 1,
      name: 'My Team',
      owner: 1,
      leagueId: 1,
      waiverOrder: 1,
      faabBudget: 100,
      avatarUrl: null,
      bannerUrl: null,
      logoUrl: null,
      primaryColor: null,
      secondaryColor: null,
    },
  ];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getteammembers')) {
      if (errorMembers) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load team' }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers } }),
        });
      }
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: teamList } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId } }),
      });
    } else if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
    } else if (postData.includes('updateteambranding')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updateTeamBranding: { id: 1 } } }),
      });
    } else if (
      postData.includes('getteamassistantsettings') ||
      postData.includes('teamassistant')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamAssistantSettings: null } }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests: Team Identity ──────────────────────────────────────────────────────

test.describe('Team Detail Page – team identity @regression', () => {
  test('displays the team name', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('My Team')).toBeVisible();
  });

  test('displays a Back button', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByRole('button', { name: /back/i })).toBeVisible();
  });

  test('shows the first letter of team name as avatar fallback', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // Avatar fallback shows 'M' (first char of 'My Team')
    await expect(page.getByText('M', { exact: true }).first()).toBeVisible();
  });
});

// ── Tests: Roster ─────────────────────────────────────────────────────────────

test.describe('Team Detail Page – roster @regression', () => {
  test('displays the "Roster" heading', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Roster', { exact: true }).first(),
    ).toBeVisible();
  });

  test('shows player name from team members', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [
        mockMember({
          player: {
            firstName: 'Babe',
            lastName: 'Ruth',
            __typename: 'Player',
            id: 101,
          },
        }),
      ],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();
  });

  test('shows multiple players', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [
        mockMember({
          id: 1,
          playerId: 101,
          player: {
            firstName: 'Babe',
            lastName: 'Ruth',
            __typename: 'Player',
            id: 101,
          },
        }),
        mockMember({
          id: 2,
          playerId: 102,
          player: {
            firstName: 'Ty',
            lastName: 'Cobb',
            __typename: 'Player',
            id: 102,
          },
        }),
      ],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();
    await expect(page.getByText('Ty Cobb')).toBeVisible();
  });

  test('shows position ID for each roster member', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: 5 })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText(/Position ID: 5/)).toBeVisible();
  });
});

// ── Tests: GM Settings ────────────────────────────────────────────────────────

test.describe('Team Detail Page — GM settings @regression', () => {
  test('GM sees "Team Settings" section', async ({ page }) => {
    await setupGraphQL(page, {
      userTeamId: 1,
      league: {
        ...MOCK_LEAGUE,
        userMembership: { teamId: 1, permissionLevel: 'owner' },
      },
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).toBeVisible();
  });

  test('GM sees "Team Branding" section', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Branding')).toBeVisible();
  });

  test('visitor does not see Team Settings section', async ({ page }) => {
    // user owns team 2, not team 1
    await setupGraphQL(page, { userTeamId: 2 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).not.toBeVisible();
  });

  test('visitor sees "viewing as a visitor" note', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 2 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/viewing this team as a visitor/i),
    ).toBeVisible();
  });
});

// ── Tests: Error State ────────────────────────────────────────────────────────

test.describe('Team Detail Page — error state @regression', () => {
  test('shows error message when team members query fails', async ({
    page,
  }) => {
    await setupGraphQL(page, { errorMembers: true });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText(/error loading team/i)).toBeVisible();
  });
});
