/**
 * Team Detail Page E2E Tests (LS-680)
 *
 * Covers: team info display (league ID, custom avatar/banner), roster view
 * with position type names, branding display & form interactions, owner vs
 * visitor vs commissioner access.
 *
 * Complements the base team-detail.spec.ts (LS-602) which covers the
 * fundamental page structure, basic roster listing, and error states.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Route: /baseball/teams/:teamId
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

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

/** 1x1 transparent PNG as a base64 data URI — used for mock image URLs. */
const MOCK_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Intercept external image URLs (example.com, cdn.example.com) and return a
 * valid 1x1 transparent PNG so the E2E API isolation layer does not block them.
 */
async function mockExternalImages(page: import('@playwright/test').Page) {
  await page.route(
    (url) =>
      url.hostname === 'example.com' || url.hostname === 'cdn.example.com',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(MOCK_IMAGE_BASE64, 'base64'),
      });
    },
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const TEAM_URL = '/baseball/teams/1';

// ── Mock Data ────────────────────────────────────────────────────────────────

function mockLeague(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function mockTeam(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function mockMember(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TeamMember',
    id: 1,
    playerId: 101,
    positionId: 1,
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

function mockPositions() {
  return [
    { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'C' },
    { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
    { __typename: 'LeaguePosition', id: 3, leagueId: 1, positionType: '2B' },
    { __typename: 'LeaguePosition', id: 4, leagueId: 1, positionType: '3B' },
    { __typename: 'LeaguePosition', id: 5, leagueId: 1, positionType: 'SS' },
    { __typename: 'LeaguePosition', id: 6, leagueId: 1, positionType: 'LF' },
    { __typename: 'LeaguePosition', id: 7, leagueId: 1, positionType: 'CF' },
    { __typename: 'LeaguePosition', id: 8, leagueId: 1, positionType: 'RF' },
    { __typename: 'LeaguePosition', id: 9, leagueId: 1, positionType: 'SP' },
    { __typename: 'LeaguePosition', id: 10, leagueId: 1, positionType: 'RP' },
  ];
}

// ── GraphQL Route Handler ────────────────────────────────────────────────────

interface SetupOptions {
  teamMembers?: ReturnType<typeof mockMember>[];
  userTeamId?: number;
  league?: ReturnType<typeof mockLeague>;
  team?: ReturnType<typeof mockTeam>;
  positions?: ReturnType<typeof mockPositions>;
  errorMembers?: boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    teamMembers = [mockMember()],
    userTeamId = 1,
    league = mockLeague(),
    team = mockTeam(),
    positions = mockPositions(),
    errorMembers = false,
  } = opts;

  const teamList = [team];

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
    } else if (postData.includes('getteambyid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { teamById: { ...team, managerId: team.owner } },
        }),
      });
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
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: positions } }),
      });
    } else if (postData.includes('updateteambranding')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { updateTeamBranding: { id: 1 } },
        }),
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
    } else if (postData.includes('getteamleaguemembers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            teamLeagueMembers: [],
          },
        }),
      });
    } else {
      // Defer unknown GraphQL operations to baseline mocks so unmocked ops are detected reliably
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests: Team Info Display ─────────────────────────────────────────────────

test.describe('Team Detail – team info display @regression', () => {
  test('displays the league ID below the team name', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('League ID: 1')).toBeVisible();
  });

  test('shows custom avatar image when avatarUrl is set', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      team: mockTeam({ avatarUrl: 'https://example.com/avatar.png' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const avatarImg = page.locator('img[alt="Sluggers avatar"]');
    await expect(avatarImg).toBeVisible();
    await expect(avatarImg).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
  });

  test('shows letter fallback when no avatar URL is set', async ({ page }) => {
    await setupGraphQL(page, {
      team: mockTeam({ avatarUrl: null }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // 'S' is the first letter of 'Sluggers'
    await expect(page.getByText('S', { exact: true }).first()).toBeVisible();
  });

  test('displays banner image when bannerUrl is set', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      team: mockTeam({ bannerUrl: 'https://example.com/banner.jpg' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const bannerImg = page.locator('img[alt="Sluggers banner"]');
    await expect(bannerImg).toBeVisible();
    await expect(bannerImg).toHaveAttribute(
      'src',
      'https://example.com/banner.jpg',
    );
  });

  test('does not show banner section when bannerUrl is null', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      team: mockTeam({ bannerUrl: null }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // No banner image should be present
    await expect(page.locator('img[alt="Sluggers banner"]')).not.toBeVisible();
  });

  test('shows "Team not found" for invalid team ID in URL', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/teams/abc');
    await page.waitForLoadState('load');

    await expect(page.getByText('Team not found')).toBeVisible();
  });
});

// ── Tests: Roster with Position Types ────────────────────────────────────────

test.describe('Team Detail – roster with positions @regression', () => {
  test('shows position type name instead of raw ID', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: 5 })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // Position ID 5 maps to 'SS' (Shortstop) in our mock positions
    await expect(page.getByText('SS')).toBeVisible();
  });

  test('shows multiple players with different positions', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [
        mockMember({
          id: 1,
          playerId: 101,
          positionId: 1,
          player: {
            __typename: 'Player',
            id: 101,
            firstName: 'Johnny',
            lastName: 'Bench',
            brefId: 'benchjo01',
          },
        }),
        mockMember({
          id: 2,
          playerId: 102,
          positionId: 9,
          player: {
            __typename: 'Player',
            id: 102,
            firstName: 'Sandy',
            lastName: 'Koufax',
            brefId: 'koufasa01',
          },
        }),
        mockMember({
          id: 3,
          playerId: 103,
          positionId: 5,
          player: {
            __typename: 'Player',
            id: 103,
            firstName: 'Honus',
            lastName: 'Wagner',
            brefId: 'wagneho01',
          },
        }),
      ],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Johnny Bench')).toBeVisible();
    await expect(page.getByText('Sandy Koufax')).toBeVisible();
    await expect(page.getByText('Honus Wagner')).toBeVisible();

    // Verify position type labels (C, SP, SS)
    await expect(page.getByText('C', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('SP', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('SS', { exact: true }).first()).toBeVisible();
  });

  test('shows "Unassigned" when positionId is null', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: null })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Unassigned')).toBeVisible();
  });

  test('shows empty roster with Roster heading', async ({ page }) => {
    await setupGraphQL(page, { teamMembers: [] });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // Roster heading should still be visible
    await expect(
      page.getByText('Roster', { exact: true }).first(),
    ).toBeVisible();

    // No player names should appear
    await expect(page.getByText('Babe Ruth')).not.toBeVisible();
  });
});

// ── Tests: Branding Display & Form ───────────────────────────────────────────

test.describe('Team Detail – branding form (GM) @regression', () => {
  test('GM sees Avatar URL and Banner URL input fields', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByPlaceholder('https://example.com/my-logo.png'),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder('https://example.com/my-banner.jpg'),
    ).toBeVisible();
  });

  test('GM sees personalisation instructions text', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/personalise your team with a logo and banner/i),
    ).toBeVisible();
  });

  test('Save Branding button is disabled when inputs are empty', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const saveButton = page.getByRole('button', { name: /save branding/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();
  });

  test('shows current avatar URL when team has one', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({ avatarUrl: 'https://cdn.example.com/my-logo.png' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Current: https://cdn.example.com/my-logo.png'),
    ).toBeVisible();
  });

  test('shows current banner URL when team has one', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({ bannerUrl: 'https://cdn.example.com/my-banner.jpg' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Current: https://cdn.example.com/my-banner.jpg'),
    ).toBeVisible();
  });

  test('shows Clear buttons for existing branding URLs', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({
        avatarUrl: 'https://cdn.example.com/avatar.png',
        bannerUrl: 'https://cdn.example.com/banner.jpg',
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const clearButtons = page.getByRole('button', { name: /clear/i });
    // One Clear button for avatar, one for banner
    await expect(clearButtons).toHaveCount(2);
  });
});

// ── Tests: Owner vs Visitor vs Commissioner ──────────────────────────────────

test.describe('Team Detail – owner info & permissions @regression', () => {
  test('team owner sees Team Settings heading', async ({ page }) => {
    await setupGraphQL(page, {
      userTeamId: 1,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 1,
          permissionLevel: 'owner',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).toBeVisible();
  });

  test('general_manager permission also sees Team Settings', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      userTeamId: 1,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 1,
          permissionLevel: 'general_manager',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).toBeVisible();
  });

  test('commissioner sees Team Settings for any team', async ({ page }) => {
    // Commissioner does not own team 1 (their team is 2) but has commissioner perm
    await setupGraphQL(page, {
      userTeamId: 2,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 2,
          permissionLevel: 'commissioner',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).toBeVisible();
  });

  test('visitor does not see Team Settings or branding form', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      userTeamId: 2,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 2,
          permissionLevel: 'member',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Team Settings')).not.toBeVisible();
    await expect(page.getByText('Team Branding')).not.toBeVisible();
  });

  test('visitor sees visitor notice', async ({ page }) => {
    await setupGraphQL(page, {
      userTeamId: 2,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 2,
          permissionLevel: 'member',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/viewing this team as a visitor/i),
    ).toBeVisible();
  });

  test('owner does not see visitor notice', async ({ page }) => {
    await setupGraphQL(page, {
      userTeamId: 1,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 1,
          permissionLevel: 'owner',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/viewing this team as a visitor/i),
    ).not.toBeVisible();
  });

  test('commissioner does not see visitor notice', async ({ page }) => {
    await setupGraphQL(page, {
      userTeamId: 2,
      league: mockLeague({
        userMembership: {
          __typename: 'LeagueMember',
          leagueId: 1,
          userId: 1,
          teamId: 2,
          permissionLevel: 'commissioner',
          username: 'testuser',
        },
      }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/viewing this team as a visitor/i),
    ).not.toBeVisible();
  });
});
