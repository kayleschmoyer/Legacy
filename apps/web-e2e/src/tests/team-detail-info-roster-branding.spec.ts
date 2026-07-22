/**
 * Team Detail Page E2E Tests (LS-680, LS-5362)
 *
 * Covers: team info display (league ID, custom avatar/banner), roster view
 * with position type names, branding display & form interactions, branding
 * save/clear/upload actions (LS-5362), owner vs visitor vs commissioner
 * access.
 *
 * Complements the base team-detail.spec.ts (LS-602) which covers the
 * fundamental page structure, basic roster listing, and error states.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Route: /baseball/teams/:teamId
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      permissionLevel: 'general_manager',
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
  errorBranding?: boolean;
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
    errorBranding = false,
  } = opts;

  const teamList = [team];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';
    const operationName = extractOperationName(route).toLowerCase();

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
          data: { team: { ...team, managerId: team.owner } },
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
    } else if (operationName === 'getviewermembership') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            viewerMembership: {
              __typename: 'LeagueMember',
              leagueId: league.userMembership.leagueId,
              userId: league.userMembership.userId,
              teamId: league.userMembership.teamId,
              permissionLevel: league.userMembership.permissionLevel,
            },
          },
        }),
      });
    } else if (operationName === 'getleaguename') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueName: league.name } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: positions } }),
      });
    } else if (postData.includes('updateteambranding')) {
      if (errorBranding) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to save branding' }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { updateTeamBranding: { id: 1 } },
          }),
        });
      }
    } else if (operationName === 'updateteammemberposition') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { updateTeamMemberPosition: { id: 1 } },
        }),
      });
    } else if (operationName === 'swapteammemberpositions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { swapTeamMemberPositions: [] },
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
  test('displays a link to the league instead of the raw league ID', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText(/league id/i)).not.toBeVisible();
    const leagueLink = page.getByRole('button', {
      name: 'Part of Test League',
    });
    await expect(leagueLink).toBeVisible();
    await leagueLink.click();
    await expect(page).toHaveURL(/\/baseball\/league\/1$/);
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

    // Position ID 5 maps to 'SS' (Shortstop) in our mock positions.
    // Exact match avoids colliding with nav labels like "Players"+"Stats"
    // whose combined text content contains "ss".
    await expect(page.getByText('SS', { exact: true }).first()).toBeVisible();
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

  test('shows a bench player when positionId is null', async ({ page }) => {
    await setupGraphQL(page, {
      teamMembers: [mockMember({ positionId: null })],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    // Unassigned players render in the Bench section of the lineup editor
    // (LS-5360) rather than a static "Unassigned" label.
    await expect(page.getByTestId('roster-section-bench')).toBeVisible();
    await expect(page.getByText('Babe Ruth')).toBeVisible();
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

// ── Tests: Branding Save / Clear / Upload Actions (LS-5362) ──────────────────

// Note: these waitForRequest predicates intentionally use a quoted
// postData().includes('"updateteambranding"') check rather than
// extractOperationName() — that helper reads route.request().postData()
// and only works inside a page.route() handler; it takes a Route, not the
// Request object page.waitForRequest's predicate receives here.
test.describe('Team Detail – branding actions (GM) @regression', () => {
  test('saves an avatar URL and shows success feedback', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const avatarUrlInput = page.getByPlaceholder(
      'https://example.com/my-logo.png',
    );
    await avatarUrlInput.fill('https://cdn.example.com/new-logo.png');

    const [request] = await Promise.all([
      page.waitForRequest((req) =>
        (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
      ),
      page.getByRole('button', { name: /save branding/i }).click(),
    ]);

    const body = request.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.avatarUrl).toBe(
      'https://cdn.example.com/new-logo.png',
    );

    await expect(page.getByText('Branding saved!')).toBeVisible();
    await expect(avatarUrlInput).toHaveValue('');
  });

  test('rejects a non-HTTPS avatar URL without saving', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .getByPlaceholder('https://example.com/my-logo.png')
      .fill('http://insecure.example.com/logo.png');
    await page.getByRole('button', { name: /save branding/i }).click();

    await expect(
      page.getByText('Avatar URL must start with https://'),
    ).toBeVisible();
    await expect(page.getByText('Branding saved!')).not.toBeVisible();
  });

  test('clears the avatar after confirming the dialog', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({ avatarUrl: 'https://cdn.example.com/avatar.png' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .getByRole('button', { name: /^clear$/i })
      .first()
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText('Clear team logo?')).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest((req) =>
        (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
      ),
      page.getByRole('button', { name: /clear logo/i }).click(),
    ]);

    const body = request.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.avatarUrl).toBe('');

    await expect(page.getByText('Branding saved!')).toBeVisible();
  });

  test('cancelling the clear dialog leaves the current avatar untouched', async ({
    page,
  }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({ avatarUrl: 'https://cdn.example.com/avatar.png' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .getByRole('button', { name: /^clear$/i })
      .first()
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(
      page.getByText('Current: https://cdn.example.com/avatar.png'),
    ).toBeVisible();
  });

  test('uploads a valid avatar image with a CSRF-protected request', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });

    await page.route(
      (url) => url.pathname.includes('/images/upload'),
      async (route) => {
        // Cross-origin POST with a non-simple Content-Type (image/png)
        // triggers a real CORS preflight — answer OPTIONS with CORS headers
        // so the browser proceeds to send the actual POST. The real fetch
        // uses credentials: 'include', so the origin must be echoed back
        // (not '*') and Allow-Credentials set, or the browser blocks the
        // response after a successful network round-trip.
        const origin = (await route.request().allHeaders())['origin'] ?? '*';
        const corsHeaders = {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        };
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              ...corsHeaders,
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
            },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify({
            url: 'https://cdn.example.com/uploaded-logo.png',
          }),
        });
      },
    );

    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const [uploadRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/images/upload') && req.method() === 'POST',
      ),
      page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: 'logo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        }),
    ]);

    // Read headers off the captured Request object rather than a
    // side-channel variable set inside the route handler above — that
    // handler runs concurrently with waitForRequest's resolution and isn't
    // guaranteed to have finished by the time this line runs.
    const uploadRequestHeaders = await uploadRequest.allHeaders();
    expect(uploadRequestHeaders['x-csrf-token']).toBe('e2e-csrf-token');

    const brandingRequest = await page.waitForRequest((req) =>
      (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
    );
    const body = brandingRequest.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.avatarUrl).toBe(
      'https://cdn.example.com/uploaded-logo.png',
    );

    await expect(page.getByText('Branding saved!')).toBeVisible();
  });

  test('rejects an oversized avatar upload without calling the upload endpoint', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });

    let uploadCalled = false;
    await page.route(
      (url) => url.pathname.includes('/images/upload'),
      async (route) => {
        uploadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'https://cdn.example.com/x.png' }),
        });
      },
    );

    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'huge-logo.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
      });

    await expect(page.getByText(/maximum allowed size is 2 mb/i)).toBeVisible();
    expect(uploadCalled).toBe(false);
  });

  test('rejects an unsupported avatar file type without calling the upload endpoint', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });

    let uploadCalled = false;
    await page.route(
      (url) => url.pathname.includes('/images/upload'),
      async (route) => {
        uploadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'https://cdn.example.com/x.png' }),
        });
      },
    );

    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'not-an-image.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });

    await expect(page.getByText(/unsupported file type/i)).toBeVisible();
    expect(uploadCalled).toBe(false);
  });

  test('saves a banner URL and shows success feedback', async ({ page }) => {
    await setupGraphQL(page, { userTeamId: 1 });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const bannerUrlInput = page.getByPlaceholder(
      'https://example.com/my-banner.jpg',
    );
    await bannerUrlInput.fill('https://cdn.example.com/new-banner.jpg');

    const [request] = await Promise.all([
      page.waitForRequest((req) =>
        (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
      ),
      page.getByRole('button', { name: /save branding/i }).click(),
    ]);

    const body = request.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.bannerUrl).toBe(
      'https://cdn.example.com/new-banner.jpg',
    );

    await expect(page.getByText('Branding saved!')).toBeVisible();
    await expect(bannerUrlInput).toHaveValue('');
  });

  test('clears the banner after confirming the dialog', async ({ page }) => {
    await mockExternalImages(page);
    await setupGraphQL(page, {
      userTeamId: 1,
      team: mockTeam({ bannerUrl: 'https://cdn.example.com/banner.jpg' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .getByRole('button', { name: /^clear$/i })
      .first()
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText('Clear team banner?')).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest((req) =>
        (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
      ),
      page.getByRole('button', { name: /clear banner/i }).click(),
    ]);

    const body = request.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.bannerUrl).toBe('');

    await expect(page.getByText('Branding saved!')).toBeVisible();
  });

  test('uploads a valid banner image with a CSRF-protected request', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });

    await page.route(
      (url) => url.pathname.includes('/images/upload'),
      async (route) => {
        const origin = (await route.request().allHeaders())['origin'] ?? '*';
        const corsHeaders = {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        };
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              ...corsHeaders,
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
            },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify({
            url: 'https://cdn.example.com/uploaded-banner.png',
          }),
        });
      },
    );

    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    const [uploadRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/images/upload') && req.method() === 'POST',
      ),
      page
        .locator('input[type="file"]')
        .nth(1)
        .setInputFiles({
          name: 'banner.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        }),
    ]);

    const uploadRequestHeaders = await uploadRequest.allHeaders();
    expect(uploadRequestHeaders['x-csrf-token']).toBe('e2e-csrf-token');

    const brandingRequest = await page.waitForRequest((req) =>
      (req.postData()?.toLowerCase() ?? '').includes('"updateteambranding"'),
    );
    const body = brandingRequest.postDataJSON() as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.bannerUrl).toBe(
      'https://cdn.example.com/uploaded-banner.png',
    );

    await expect(page.getByText('Branding saved!')).toBeVisible();
  });

  test('shows an error message when the save mutation returns a GraphQL error', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1, errorBranding: true });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .getByPlaceholder('https://example.com/my-logo.png')
      .fill('https://cdn.example.com/new-logo.png');
    await page.getByRole('button', { name: /save branding/i }).click();

    // .first() — the error surfaces both inline and via an aria-live
    // region wrapping the same text, so the plain text query matches twice.
    await expect(
      page.getByText('Failed to save branding').first(),
    ).toBeVisible();
    await expect(page.getByText('Branding saved!')).not.toBeVisible();
  });

  test('shows an error message when the upload endpoint returns an HTTP error', async ({
    page,
  }) => {
    await setupGraphQL(page, { userTeamId: 1 });

    await page.route(
      (url) => url.pathname.includes('/images/upload'),
      async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              'Access-Control-Allow-Origin':
                (await route.request().allHeaders())['origin'] ?? '*',
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
            },
          });
          return;
        }
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin':
              (await route.request().allHeaders())['origin'] ?? '*',
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({ error: 'Storage backend unavailable' }),
        });
      },
    );

    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
      });

    await expect(page.getByText('Storage backend unavailable')).toBeVisible();
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
          permissionLevel: 'general_manager',
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
          permissionLevel: 'general_manager',
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
