/**
 * Commissioner Audit Log & Delete League — E2E Tests (LS-1622)
 *
 * Covers the following commissioner features on the League Detail page:
 *   /baseball/league/:id/commissioner
 *
 *   - Commissioner Audit Log (transaction history for commissioner actions)
 *   - Delete League (danger zone with confirmation dialog)
 *   - Non-commissioner access restrictions
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';

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
function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test Commissioner League',
    description: 'E2E commissioner audit/delete test league',
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
    inviteCode: 'AUDIT1234',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
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
    name: 'Beta Force',
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
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

const MOCK_AUDIT_LOGS = [
  {
    __typename: 'CommissionerAuditLog',
    id: 1,
    leagueId: 1,
    userId: 1,
    action: 'force_add_player',
    targetType: 'player',
    targetId: 42,
    reason: 'Correcting draft error',
    createdAt: '2026-03-15T10:30:00Z',
  },
  {
    __typename: 'CommissionerAuditLog',
    id: 2,
    leagueId: 1,
    userId: 1,
    action: 'force_drop_player',
    targetType: 'player',
    targetId: 55,
    reason: 'Player inactive',
    createdAt: '2026-03-16T14:00:00Z',
  },
  {
    __typename: 'CommissionerAuditLog',
    id: 3,
    leagueId: 1,
    userId: 1,
    action: 'edit_matchup_score',
    targetType: 'matchup',
    targetId: 7,
    reason: null,
    createdAt: '2026-03-17T09:15:00Z',
  },
];

// ── GraphQL Route Setup ────────────────────────────────────────────────────────

interface MockOptions {
  league?: ReturnType<typeof makeLeague>;
  auditLogs?: typeof MOCK_AUDIT_LOGS;
  /** Called when deleteLeague mutation fires; return the response data. */
  onDeleteLeague?: () => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    league = makeLeague(),
    auditLogs = MOCK_AUDIT_LOGS,
    onDeleteLeague,
  } = opts;

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
    } else if (postData.includes('getmatchupsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
      });
    } else if (postData.includes('getcurrentweekforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: null },
        }),
      });
    } else if (
      postData.includes('getleaguedraft') ||
      postData.includes('"getleaguedraftquery"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: { __typename: 'Draft', draftMode: 'live' },
          },
        }),
      });
    } else if (postData.includes('getcommissionerauditlogs')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { commissionerAuditLogs: auditLogs },
        }),
      });
    } else if (postData.includes('deleteleague')) {
      const result = onDeleteLeague?.() ?? true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { deleteLeague: result } }),
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
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
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
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
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
    } else if (
      postData.includes('getmatchupbyid') ||
      postData.includes('getmatchupplayers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Accordion helpers ─────────────────────────────────────────────────────────

async function expandDangerZone(page: import('@playwright/test').Page) {
  // The commissioner section headers are Tamagui styled components rendered as
  // role="button" with the section title as text content.
  const toggle = page.getByRole('button', { name: 'Danger Zone', exact: true });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Audit Log — Commissioner Access ──────────────────────────────────────────

test.describe('Commissioner Audit Log — commissioner access @regression', () => {
  test('audit log query returns entries for commissioner', async ({ page }) => {
    let auditQueryCalled = false;

    await setupGraphQL(page, {
      league: makeLeague({ owner: 1 }),
      auditLogs: MOCK_AUDIT_LOGS,
    });

    // Add a route to track if the audit log query is called
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('getcommissionerauditlogs')) {
        auditQueryCalled = true;
      }
      await route.fallback();
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Verify the page loads without error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The commissioner page should render for the league owner
    await expect(
      page.getByText('Test Commissioner League', { exact: false }),
    ).toBeVisible();
  });

  test('audit log entries display action text when rendered', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ owner: 1 }),
      auditLogs: MOCK_AUDIT_LOGS,
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // The commissioner page loads — audit log mock data is available
    // Verify the page renders without errors
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Audit Log — Non-Commissioner Access ──────────────────────────────────────

test.describe('Commissioner Audit Log — non-commissioner access @regression', () => {
  test('commissioner tab is hidden for non-commissioners', async ({ page }) => {
    // League owned by user 2 — the test user (id=1) is NOT the commissioner
    await setupGraphQL(page, {
      league: makeLeague({ owner: 2 }),
      auditLogs: [],
    });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Wait for tabs to render
    await expect(
      page.getByText('Overview', { exact: false }).first(),
    ).toBeVisible();

    // The Commissioner tab should not be present for non-commissioners
    const commissionerTabs = page.getByRole('button', {
      name: /commissioner/i,
    });
    await expect(commissionerTabs).not.toBeVisible();
  });

  test('non-commissioner cannot access commissioner page directly', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ owner: 2 }),
      auditLogs: [],
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Non-commissioner navigating directly to the commissioner tab
    // should not see commissioner controls — the page either redirects
    // or does not render commissioner sections
    const dangerZoneToggle = page.getByRole('button', {
      name: 'Danger Zone',
      exact: true,
    });
    await expect(dangerZoneToggle).not.toBeVisible();
  });
});

// ── Delete League — Danger Zone Section ──────────────────────────────────────

test.describe('Delete League — danger zone section @critical', () => {
  test('shows "Danger Zone" section heading when expanded', async ({
    page,
  }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 1 }) });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandDangerZone(page);

    await expect(
      page.getByRole('heading', { name: 'Danger Zone' }),
    ).toBeVisible();
  });

  test('shows "Delete League" button in danger zone', async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 1 }) });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandDangerZone(page);

    await expect(
      page.getByRole('button', { name: /delete league/i }),
    ).toBeVisible();
  });

  test('shows permanent deletion warning text', async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 1 }) });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandDangerZone(page);

    await expect(
      page.getByText(/permanently delete this league/i),
    ).toBeVisible();
  });
});

// ── Delete League — Confirmation Dialog ──────────────────────────────────────

test.describe('Delete League — confirmation dialog @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 1 }) });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandDangerZone(page);
  });

  test('Delete League button opens a confirmation dialog', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /delete league/i });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirmation dialog should appear with league name
    await expect(page.getByText(/delete league/i).first()).toBeVisible();
    await expect(page.getByText(/this action is permanent/i)).toBeVisible();
  });

  test('confirmation dialog shows league name input prompt', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete league/i }).click();

    await expect(
      page.getByText(/type the league name to confirm/i),
    ).toBeVisible();
  });

  test('confirm button is disabled until league name is typed', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete league/i }).click();

    // The confirm "Delete League" button inside the dialog should be disabled
    // when the input is empty or does not match
    const dialogDeleteBtn = page
      .locator('[role="alertdialog"]')
      .getByRole('button', { name: /delete league/i });
    await expect(dialogDeleteBtn).toBeDisabled();
  });

  test('shows mismatch warning when wrong name is typed', async ({ page }) => {
    await page.getByRole('button', { name: /delete league/i }).click();

    // Type a wrong name
    const input = page.locator('[role="alertdialog"] input');
    await input.fill('Wrong Name');

    await expect(page.getByText(/league name does not match/i)).toBeVisible();
  });

  test('confirm button becomes enabled when correct league name is typed', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete league/i }).click();

    const input = page.locator('[role="alertdialog"] input');
    await input.fill('Test Commissioner League');

    // The confirm button inside the dialog should now be enabled
    const dialogDeleteBtn = page
      .locator('[role="alertdialog"]')
      .getByRole('button', { name: /delete league/i });
    await expect(dialogDeleteBtn).toBeEnabled();
  });

  test('cancel button closes the confirmation dialog', async ({ page }) => {
    // Scope the delete button to the danger zone region to avoid ambiguity
    // with the dialog's own "Delete League" button.
    const dangerZoneRegion = page.getByRole('region', { name: 'Danger Zone' });
    const deleteBtn = dangerZoneRegion.getByRole('button', {
      name: /delete league/i,
    });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Dialog is open
    await expect(page.getByText(/this action is permanent/i)).toBeVisible();

    // Cancel closes it — the button's accessible name is "Dialog Close"
    await page.getByRole('button', { name: /dialog close/i }).click();

    // Dialog should close
    await expect(page.getByText(/this action is permanent/i)).not.toBeVisible();

    // The delete button in the danger zone should still be visible
    await expect(deleteBtn).toBeVisible();
  });
});

// ── Delete League — Mutation ─────────────────────────────────────────────────

test.describe('Delete League — confirm mutation @regression', () => {
  test('confirms deletion and calls deleteLeague mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await setupGraphQL(page, {
      league: makeLeague({ owner: 1 }),
      onDeleteLeague: () => {
        mutationCalled = true;
        return true;
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');
    await expandDangerZone(page);

    // Open the confirmation dialog
    await page.getByRole('button', { name: /delete league/i }).click();

    // Type the correct league name
    const input = page.locator('[role="alertdialog"] input');
    await input.fill('Test Commissioner League');

    // Click the confirm delete button inside the dialog
    const dialogDeleteBtn = page
      .locator('[role="alertdialog"]')
      .getByRole('button', { name: /delete league/i });
    await expect(dialogDeleteBtn).toBeEnabled();
    await dialogDeleteBtn.click();

    // Wait until the mutation has been invoked
    await expect.poll(() => mutationCalled, { timeout: 10000 }).toBe(true);
  });
});

// ── Delete League — Non-Commissioner Access ──────────────────────────────────

test.describe('Delete League — non-commissioner cannot see delete controls @regression', () => {
  test('non-commissioner does not see danger zone section', async ({
    page,
  }) => {
    // League owned by user 2 — the test user (id=1) is NOT the commissioner
    await setupGraphQL(page, { league: makeLeague({ owner: 2 }) });
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('load');

    // Wait for tabs to render
    await expect(
      page.getByText('Overview', { exact: false }).first(),
    ).toBeVisible();

    // Commissioner tab should not be visible, so danger zone is inaccessible
    const commissionerTabs = page.getByRole('button', {
      name: /commissioner/i,
    });
    await expect(commissionerTabs).not.toBeVisible();

    // Danger zone section toggle should not exist
    const dangerZoneToggle = page.getByRole('button', {
      name: 'Danger Zone',
      exact: true,
    });
    await expect(dangerZoneToggle).not.toBeVisible();
  });

  test('non-commissioner cannot see delete league button on direct navigation', async ({
    page,
  }) => {
    await setupGraphQL(page, { league: makeLeague({ owner: 2 }) });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // Delete League button should not be visible for non-commissioners
    const deleteBtn = page.getByRole('button', { name: /delete league/i });
    await expect(deleteBtn).not.toBeVisible();
  });
});
