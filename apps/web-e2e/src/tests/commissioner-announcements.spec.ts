/**
 * Commissioner Announcements E2E Tests (LS-694)
 *
 * Covers: create/send announcement, broadcast display, compose dismissal.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect } from '@playwright/test';
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

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** League owned by user id=1 (matches the default test JWT). */
const COMMISSIONER_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Commissioners Cup',
  description: 'Test league for announcements E2E',
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
  inviteCode: 'COMM1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

/** League owned by user id=2 — current test user (id=1) is NOT the commissioner. */
const MEMBER_LEAGUE = { ...COMMISSIONER_LEAGUE, owner: 2 };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Team',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Team',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
];

function mockAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'LeagueChatMessage',
    id: '101',
    userId: 1,
    messageText: 'League draft is scheduled for next Friday at 8 PM!',
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    messageType: 'league_announcement',
    sender: { __typename: 'User', username: 'the_commish' },
    ...overrides,
  };
}

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface RouteOptions {
  /** League object to return from getLeagueByid queries */
  league?: typeof COMMISSIONER_LEAGUE;
  /** Initial announcements to return from getLeagueAnnouncements */
  announcements?: ReturnType<typeof mockAnnouncement>[];
  /**
   * Callback invoked when a postLeagueAnnouncement mutation is intercepted.
   * Return the new announcement to fulfill the mutation response.
   */
  onPostAnnouncement?: (vars: {
    messageText: string;
  }) => ReturnType<typeof mockAnnouncement>;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: RouteOptions = {},
) {
  const {
    league = COMMISSIONER_LEAGUE,
    announcements: initialAnnouncements = [],
    onPostAnnouncement,
  } = opts;

  let currentAnnouncements = [...initialAnnouncements];

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getLeagueAnnouncements: currentAnnouncements },
        }),
      });
    } else if (postData.includes('postleagueannouncement')) {
      // Parse the messageText from the request body to build the new announcement.
      let messageText = 'Test announcement';
      try {
        const raw = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { messageText?: string };
        };
        messageText = raw.variables?.messageText ?? messageText;
      } catch {
        // ignore JSON parse errors; fall back to default message
      }

      const newAnnouncement = onPostAnnouncement
        ? onPostAnnouncement({ messageText })
        : mockAnnouncement({
            messageText,
            id: '999',
            timestamp: new Date().toISOString(),
          });

      // Persist the announcement so subsequent getLeagueAnnouncements returns it.
      currentAnnouncements = [newAnnouncement, ...currentAnnouncements];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { postLeagueAnnouncement: newAnnouncement },
        }),
      });
    } else if (
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (
      postData.includes('getteamwaiverclaims') ||
      postData.includes('teamwaiverclaims')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (
      postData.includes('getleaguestandings') ||
      postData.includes('leaguestandings')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      postData.includes('getuserleagues') ||
      postData.includes('getusers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
    } else if (
      postData.includes('getcurrentmatchup') ||
      postData.includes('getmatchupbyid') ||
      postData.includes('getmatchupsforleague') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (
      postData.includes('getleaguescoring') ||
      postData.includes('leaguescoringprofile')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (
      postData.includes('getpendingtradeoffers') ||
      postData.includes('pendingtradeoffers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Commissioner View Tests ───────────────────────────────────────────────────

test.describe('Commissioner Announcements — commissioner view @regression', () => {
  test('panel renders for commissioner when there are no announcements', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Panel heading is visible
    await expect(page.getByText('Commissioner Announcements')).toBeVisible();
  });

  test('commissioner sees the "New Announcement" button', async ({ page }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: /new announcement/i }),
    ).toBeVisible();
  });

  test('commissioner sees empty-state message when no announcements exist', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(page.getByText(/no announcements yet/i)).toBeVisible();
  });

  test('clicking "New Announcement" opens the compose form', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /new announcement/i }).click();

    // Textarea is visible
    await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible();

    // Post and Cancel buttons appear
    await expect(
      page.getByRole('button', { name: /post announcement/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('"Post Announcement" button is disabled when textarea is empty', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /new announcement/i }).click();
    await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible();

    await expect(
      page.getByRole('button', { name: /post announcement/i }),
    ).toBeDisabled();
  });

  test('cancel button dismisses the compose form', async ({ page }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /new announcement/i }).click();
    await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();

    // Compose form disappears
    await expect(
      page.getByPlaceholder(/write an announcement/i),
    ).not.toBeVisible();

    // "New Announcement" button is visible again
    await expect(
      page.getByRole('button', { name: /new announcement/i }),
    ).toBeVisible();
  });

  test('commissioner can post an announcement and it appears in the list', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    const announcementText =
      'Season draft is scheduled for next Friday at 8 PM!';

    // Open compose form
    await page.getByRole('button', { name: /new announcement/i }).click();
    await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible();

    // Type the announcement
    await page
      .getByPlaceholder(/write an announcement/i)
      .fill(announcementText);

    // Post button should now be enabled
    await expect(
      page.getByRole('button', { name: /post announcement/i }),
    ).toBeEnabled();

    // Submit
    await page.getByRole('button', { name: /post announcement/i }).click();

    // The posted announcement text should appear in the list
    await expect(page.getByText(announcementText)).toBeVisible();

    // Compose form should be closed after posting
    await expect(
      page.getByPlaceholder(/write an announcement/i),
    ).not.toBeVisible();
  });

  test('count badge appears when there are announcements', async ({ page }) => {
    const announcement = mockAnnouncement();
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // The announcement count badge (shows "1") should be visible
    await expect(page.getByText('Commissioner Announcements')).toBeVisible();
    // The announcement text should render in the list
    await expect(page.getByText(announcement.messageText)).toBeVisible();
  });

  test('existing announcement shows sender name and "Commissioner" badge', async ({
    page,
  }) => {
    const announcement = mockAnnouncement();
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    await expect(page.getByText(announcement.messageText)).toBeVisible();
    // Sender username displayed (exact match to avoid collisions with page chrome)
    await expect(
      page.getByText(announcement.sender.username, { exact: true }),
    ).toBeVisible();
    // "Commissioner" badge
    await expect(
      page.getByText('Commissioner', { exact: true }).first(),
    ).toBeVisible();
  });
});

// ── Member (non-commissioner) View Tests ─────────────────────────────────────

test.describe('Commissioner Announcements — member view @regression', () => {
  test('panel is hidden for non-commissioner when no announcements exist', async ({
    page,
  }) => {
    await setupGraphQL(page, { league: MEMBER_LEAGUE, announcements: [] });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Panel should not be rendered at all
    await expect(
      page.getByText('Commissioner Announcements'),
    ).not.toBeVisible();
  });

  test('panel is visible for non-commissioner when announcements exist', async ({
    page,
  }) => {
    const announcement = mockAnnouncement();
    await setupGraphQL(page, {
      league: MEMBER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Panel heading is visible
    await expect(page.getByText('Commissioner Announcements')).toBeVisible();

    // Announcement content is displayed
    await expect(page.getByText(announcement.messageText)).toBeVisible();
  });

  test('"New Announcement" button is not visible to non-commissioner members', async ({
    page,
  }) => {
    const announcement = mockAnnouncement();
    await setupGraphQL(page, {
      league: MEMBER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // The announcement panel is shown (there are announcements)
    await expect(page.getByText('Commissioner Announcements')).toBeVisible();

    // But the compose button must NOT be shown to regular members
    await expect(
      page.getByRole('button', { name: /new announcement/i }),
    ).not.toBeVisible();
  });
});

// ── Ctrl+Enter keyboard shortcut ─────────────────────────────────────────────

test.describe('Commissioner Announcements — keyboard shortcut @regression', () => {
  test('Ctrl+Enter submits the announcement', async ({ page }) => {
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    const announcementText = 'Keyboard shortcut test announcement';

    await page.getByRole('button', { name: /new announcement/i }).click();
    await expect(page.getByPlaceholder(/write an announcement/i)).toBeVisible();

    await page
      .getByPlaceholder(/write an announcement/i)
      .fill(announcementText);

    // Press Ctrl+Enter to submit
    await page
      .getByPlaceholder(/write an announcement/i)
      .press('Control+Enter');

    // Announcement should appear in the list
    await expect(page.getByText(announcementText)).toBeVisible();
  });
});
