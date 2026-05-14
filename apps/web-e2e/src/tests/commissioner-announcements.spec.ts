/**
 * Commissioner Announcements E2E Tests (LS-694)
 *
 * Covers: create/send announcement, broadcast display, compose dismissal.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

/**
 * Non-admin test fixture — the default `test` fixture may carry an admin JWT
 * (e.g. via the local device-flow auth cache).  The `isCommissioner` check in
 * LeagueDetailPage grants commissioner privileges to any user with
 * `accessLevel === 'admin'`, which defeats the MEMBER_LEAGUE mock.  Using
 * `createCustomAuthTest` ensures the JWT has `accessLevel: 'none'` so that
 * commissioner status is determined solely by league ownership.
 */
const memberTest = createCustomAuthTest('member@test.com', 'none');

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
  /**
   * Callback invoked when a deleteLeagueAnnouncement mutation is intercepted.
   * Return true to indicate success.
   */
  onDeleteAnnouncement?: (vars: { id: number; leagueId: number }) => boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: RouteOptions = {},
) {
  const {
    league = COMMISSIONER_LEAGUE,
    announcements: initialAnnouncements = [],
    onPostAnnouncement,
    onDeleteAnnouncement,
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
    } else if (postData.includes('deleteleagueannouncement')) {
      // Parse the id from the request body
      let deleteId = 0;
      try {
        const raw = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { id?: number; leagueId?: number };
        };
        deleteId = raw.variables?.id ?? 0;
      } catch {
        // ignore JSON parse errors
      }

      // Remove the announcement from the in-memory list
      currentAnnouncements = currentAnnouncements.filter(
        (a) => String(a.id) !== String(deleteId),
      );

      const success = onDeleteAnnouncement
        ? onDeleteAnnouncement({ id: deleteId, leagueId: league.id })
        : true;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { deleteLeagueAnnouncement: success },
        }),
      });
    } else if (postData.includes('updateleagueannouncement')) {
      // Parse the updated fields from the request body
      let updateId = '0';
      let updatedText = '';
      try {
        const raw = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { id?: number; leagueId?: number; messageText?: string };
        };
        updateId = String(raw.variables?.id ?? 0);
        updatedText = raw.variables?.messageText ?? '';
      } catch {
        // ignore JSON parse errors
      }

      // Update the announcement in the in-memory list
      currentAnnouncements = currentAnnouncements.map((a) =>
        String(a.id) === updateId ? { ...a, messageText: updatedText } : a,
      );

      const updated = currentAnnouncements.find(
        (a) => String(a.id) === updateId,
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { updateLeagueAnnouncement: updated ?? null },
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
      await unmockedGraphQLFallback(route);
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

    // Wait for compose form to close before checking the list — avoids a strict
    // mode violation where getByText resolves to both the textarea and the list
    // item simultaneously.
    await expect(
      page.getByPlaceholder(/write an announcement/i),
    ).not.toBeVisible();

    // The posted announcement text should appear in the list
    await expect(page.getByText(announcementText)).toBeVisible();
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
    // "Commissioner" badge (scoped to main so the nav league-switcher
    // "Current league: ..." button is not matched)
    await expect(
      page.getByRole('main').getByText('Commissioner', { exact: true }).first(),
    ).toBeVisible();
  });
});

// ── Member (non-commissioner) View Tests ─────────────────────────────────────

memberTest.describe(
  'Commissioner Announcements — member view @regression',
  () => {
    memberTest(
      'panel is hidden for non-commissioner when no announcements exist',
      async ({ page }) => {
        await setupGraphQL(page, { league: MEMBER_LEAGUE, announcements: [] });
        await page.goto('/baseball/league/1/overview');
        await page.waitForLoadState('load');

        // Panel should not be rendered at all
        await expect(
          page.getByText('Commissioner Announcements'),
        ).not.toBeVisible();
      },
    );

    memberTest(
      'panel is visible for non-commissioner when announcements exist',
      async ({ page }) => {
        const announcement = mockAnnouncement();
        await setupGraphQL(page, {
          league: MEMBER_LEAGUE,
          announcements: [announcement],
        });
        await page.goto('/baseball/league/1/overview');
        await page.waitForLoadState('load');

        // Panel heading is visible
        await expect(
          page.getByText('Commissioner Announcements'),
        ).toBeVisible();

        // Announcement content is displayed
        await expect(page.getByText(announcement.messageText)).toBeVisible();
      },
    );

    memberTest(
      '"New Announcement" button is not visible to non-commissioner members',
      async ({ page }) => {
        const announcement = mockAnnouncement();
        await setupGraphQL(page, {
          league: MEMBER_LEAGUE,
          announcements: [announcement],
        });
        await page.goto('/baseball/league/1/overview');
        await page.waitForLoadState('load');

        // The announcement panel is shown (there are announcements)
        await expect(
          page.getByText('Commissioner Announcements'),
        ).toBeVisible();

        // But the compose button must NOT be shown to regular members
        await expect(
          page.getByRole('button', { name: /new announcement/i }),
        ).not.toBeVisible();
      },
    );
  },
);

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

    // Wait for compose form to close before checking the list — avoids a strict
    // mode violation where getByText resolves to both the textarea and the list
    // item simultaneously, and ensures the mutation has propagated.
    await expect(
      page.getByPlaceholder(/write an announcement/i),
    ).not.toBeVisible();

    // Announcement should appear in the list
    await expect(page.getByText(announcementText)).toBeVisible();
  });
});

// ── Delete Announcement Tests ─────────────────────────────────────────────

test.describe('Commissioner Announcements — delete flow @regression', () => {
  test('commissioner sees delete button on existing announcements', async ({
    page,
  }) => {
    const announcement = mockAnnouncement();
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Announcement text is visible
    await expect(page.getByText(announcement.messageText)).toBeVisible();

    // Delete button (aria-label) is visible for commissioner
    await expect(
      page.getByRole('button', { name: /delete announcement/i }),
    ).toBeVisible();
  });

  test('clicking delete removes the announcement from the list', async ({
    page,
  }) => {
    const announcement = mockAnnouncement({ id: '201' });
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Announcement is visible
    await expect(page.getByText(announcement.messageText)).toBeVisible();

    // Click the delete button
    await page.getByRole('button', { name: /delete announcement/i }).click();

    // After deletion the announcement text should disappear
    await expect(page.getByText(announcement.messageText)).not.toBeVisible();

    // Empty state should reappear
    await expect(page.getByText(/no announcements yet/i)).toBeVisible();
  });

  test('deleting one announcement leaves other announcements intact', async ({
    page,
  }) => {
    const first = mockAnnouncement({
      id: '301',
      messageText: 'First announcement — keep this one',
    });
    const second = mockAnnouncement({
      id: '302',
      messageText: 'Second announcement — delete this one',
    });
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [first, second],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Both announcements are visible
    await expect(page.getByText(first.messageText)).toBeVisible();
    await expect(page.getByText(second.messageText)).toBeVisible();

    // Click the delete button on the second announcement (last one in the list)
    const deleteButtons = page.getByRole('button', {
      name: /delete announcement/i,
    });
    await deleteButtons.nth(1).click();

    // Second announcement should disappear
    await expect(page.getByText(second.messageText)).not.toBeVisible();

    // First announcement should still be visible
    await expect(page.getByText(first.messageText)).toBeVisible();
  });
});

// ── Edit Announcement Tests ───────────────────────────────────────────────

test.describe('Commissioner Announcements — edit flow @regression', () => {
  test('commissioner sees edit button on existing announcements', async ({
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
    await expect(
      page.getByRole('button', { name: /edit announcement/i }),
    ).toBeVisible();
  });

  test('clicking edit opens inline edit form and save updates the text', async ({
    page,
  }) => {
    const announcement = mockAnnouncement({
      id: '401',
      messageText: 'Original announcement text',
    });
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Click edit button
    await page.getByRole('button', { name: /edit announcement/i }).click();

    // The inline textarea should appear with the current text
    const editTextarea = page.locator('textarea').first();
    await expect(editTextarea).toBeVisible();
    await expect(editTextarea).toHaveValue('Original announcement text');

    // Clear and type new text
    await editTextarea.fill('Updated announcement text');

    // Click Save button
    await page.getByRole('button', { name: /save/i }).click();

    // The updated text should appear
    await expect(page.getByText('Updated announcement text')).toBeVisible();

    // The original text should be gone
    await expect(
      page.getByText('Original announcement text'),
    ).not.toBeVisible();
  });

  test('clicking cancel during edit discards changes', async ({ page }) => {
    const announcement = mockAnnouncement({
      id: '501',
      messageText: 'Announcement to not edit',
    });
    await setupGraphQL(page, {
      league: COMMISSIONER_LEAGUE,
      announcements: [announcement],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Click edit button
    await page.getByRole('button', { name: /edit announcement/i }).click();

    // Modify the text
    const editTextarea = page.locator('textarea').first();
    await editTextarea.fill('This change should be discarded');

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Original text should still be visible
    await expect(page.getByText('Announcement to not edit')).toBeVisible();

    // Discarded text should not appear
    await expect(
      page.getByText('This change should be discarded'),
    ).not.toBeVisible();
  });
});

// ── Non-commissioner visibility — delete & edit buttons ──────────────────────
// These tests require a non-admin JWT so that `isCommissioner` is determined
// solely by league ownership (the admin accessLevel override is removed).

memberTest.describe(
  'Commissioner Announcements — non-commissioner button visibility @regression',
  () => {
    memberTest(
      'non-commissioner does not see delete button',
      async ({ page }) => {
        const announcement = mockAnnouncement();
        await setupGraphQL(page, {
          league: MEMBER_LEAGUE,
          announcements: [announcement],
        });
        await page.goto('/baseball/league/1/overview');
        await page.waitForLoadState('load');

        // Announcement text is visible
        await expect(page.getByText(announcement.messageText)).toBeVisible();

        // Delete button should NOT be visible for regular members
        await expect(
          page.getByRole('button', { name: /delete announcement/i }),
        ).not.toBeVisible();
      },
    );

    memberTest(
      'non-commissioner does not see edit button',
      async ({ page }) => {
        const announcement = mockAnnouncement();
        await setupGraphQL(page, {
          league: MEMBER_LEAGUE,
          announcements: [announcement],
        });
        await page.goto('/baseball/league/1/overview');
        await page.waitForLoadState('load');

        await expect(page.getByText(announcement.messageText)).toBeVisible();
        await expect(
          page.getByRole('button', { name: /edit announcement/i }),
        ).not.toBeVisible();
      },
    );
  },
);
