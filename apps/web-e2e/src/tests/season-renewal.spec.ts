/**
 * E2E Tests: Season Renewal Flow (LS-690)
 *
 * Covers the season renewal UI driven by NextStepControl on the commissioner
 * tab: /baseball/league/:id/commissioner → "Next Step" section
 *
 * The "Start New Season" button and confirmation dialog are shown when the
 * season is complete:
 *   - draftStatus === 'completed'
 *   - frozenAt is null (league not yet archived)
 *   - all scheduled matchup weeks have been played (highestWeek >= totalMatchups)
 *   - no active currentMatchup
 *
 * Scenarios tested:
 *   - "Start New Season" button visible when season is complete
 *   - Button NOT visible when draft is not yet completed
 *   - Button NOT visible when league is already frozen (archived)
 *   - Confirmation dialog opens on button click
 *   - Roster handling radio options (new draft vs keep rosters) present
 *   - Cancel dismisses the dialog without mutation
 *   - Confirm triggers RenewLeague mutation and navigates to new league
 *   - "Keep rosters" option changes descriptive text
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Playoff Champions',
    description: 'E2E season renewal test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
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
    inviteCode: 'RENEW123',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 1,
    playoffEnabled: false,
    playoffFormat: null,
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

/** One completed matchup for week 1. currentMatchup=null means no active matchup. */
const COMPLETED_MATCHUPS = [
  {
    __typename: 'Matchup',
    id: '1',
    weekNumber: 1,
    leagueId: 1,
    team1Id: 1,
    team2Id: 2,
    team1Score: 55.0,
    team2Score: 48.5,
    status: 'final',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    selectedGamesCount: 5,
    startTime: null,
    endTime: null,
  },
];

function makeNewLeague(id = 2) {
  return {
    ...makeLeague({ id, draftStatus: 'not-started', frozenAt: null }),
    previousLeagueId: 1,
    seasonNumber: 2,
  };
}

// ── GraphQL mock setup ─────────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeLeague>;
  matchups?: Array<Record<string, unknown>>;
  onRenewLeague?: () => unknown;
  renewLeagueDelay?: number;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeLeague(),
    matchups = COMPLETED_MATCHUPS,
    onRenewLeague,
    renewLeagueDelay,
  } = opts;

  const newLeague = makeNewLeague();

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: Record<string, unknown>;
      };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        const requestedId =
          body.variables?.['leagueId'] ?? body.variables?.['id'];
        const leagueData =
          requestedId !== undefined && Number(requestedId) === newLeague.id
            ? newLeague
            : league;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: leagueData } }),
        });
        return;
      }
      if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
        return;
      }
      if (op === 'GetPositionsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: [] } }),
        });
        return;
      }
      if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
        return;
      }
      if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupsForLeague: matchups } }),
        });
        return;
      }
      if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: null } }),
        });
        return;
      }
      if (op === 'GetLeagueDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getLeagueDraft: { __typename: 'Draft', draftMode: 'live' },
            },
          }),
        });
        return;
      }
      if (op === 'GetDraftTeamOrder') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
        });
        return;
      }
      if (op === 'GetUserLeagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userLeagues: [league] } }),
        });
        return;
      }
      if (op === 'GetLeagueScoringProfile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueScoringProfile: null } }),
        });
        return;
      }
      if (op === 'RenewLeague') {
        if (renewLeagueDelay) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, renewLeagueDelay),
          );
        }
        const result = onRenewLeague?.() ?? makeNewLeague();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { renewLeague: result } }),
        });
        return;
      }

      // Fall through to the baseline _apiIsolation fixture for ambient
      // queries (getUnreadNotificationCount, getUserById, etc.)
      await unmockedGraphQLFallback(route);
    },
  );
}

/** Wait for the NextStepControl to be visible. */
async function ensureNextStepVisible(page: import('@playwright/test').Page) {
  // V2 renders NextStepControl at the top of the commissioner tab without
  // a "Next Step" accordion wrapper (legacy used a section title heading).
  // Wait for the commissioner tab to be selected in the league-sections
  // tablist (RoleBar has its own "Commissioner" tab, so scope explicitly).
  await expect(
    page
      .getByRole('tablist', { name: 'League sections' })
      .getByRole('tab', { name: 'Commissioner' }),
  ).toHaveAttribute('aria-selected', 'true');
}

// ── Tests: Visibility Conditions ──────────────────────────────────────────────

test.describe('Season Renewal — Visibility @critical', () => {
  test('shows "Start New Season" button when season is complete @smoke', async ({
    page,
  }) => {
    // Season complete: draftStatus=completed, frozenAt=null,
    // totalMatchups=1, matchup weekNumber=1, currentMatchup=null
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await ensureNextStepVisible(page);

    await expect(
      page.getByRole('button', { name: /start new season/i }),
    ).toBeVisible();
  });

  test('shows "Season Complete" label when season is complete @smoke', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('Season Complete')).toBeVisible();
  });

  test('does NOT show "Start New Season" when draft is not yet completed @regression', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'not-started' }),
      matchups: [],
    });
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByRole('button', { name: /start new season/i }),
    ).not.toBeVisible();
  });

  test('does NOT show "Start New Season" when league is already archived @regression', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ frozenAt: '2025-10-01T00:00:00.000Z' }),
    });
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByRole('button', { name: /start new season/i }),
    ).not.toBeVisible();
  });

  test('does NOT show "Start New Season" when matchups are not yet complete @regression', async ({
    page,
  }) => {
    // totalMatchups=3 but only week 1 has been played → not season complete
    await setupGraphQL(page, {
      league: makeLeague({ totalMatchups: 3 }),
    });
    await page.goto('/baseball/league/1/commissioner');

    await expect(
      page.getByRole('button', { name: /start new season/i }),
    ).not.toBeVisible();
  });
});

// ── Tests: Confirmation Dialog ────────────────────────────────────────────────

test.describe('Season Renewal — Confirmation Dialog @critical', () => {
  test('clicking "Start New Season" opens the confirmation dialog @critical', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    const startBtn = page.getByRole('button', { name: /start new season/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Dialog has role="alertdialog" and title matching the league name
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Playoff Champions');
  });

  test('dialog shows "How should rosters be handled?" prompt @critical', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByText(/how should rosters be handled/i),
    ).toBeVisible();
  });

  test('dialog presents "new draft" and "keep rosters" radio options @critical', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByText(/hold a new draft.*start with empty rosters/i),
    ).toBeVisible();
    await expect(
      dialog.getByText(/keep same rosters.*carry over all player assignments/i),
    ).toBeVisible();
  });

  test('"New Draft" option is selected by default @regression', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');

    // "draft" radio is the default; its helper text describes clearing rosters
    await expect(
      dialog.getByText(/all team rosters will be cleared/i),
    ).toBeVisible();
  });

  test('selecting "Keep Rosters" updates descriptive text @regression', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');

    // Click the "keep" radio option
    const keepLabel = dialog.getByText(/keep same rosters/i);
    await keepLabel.click();

    // Descriptive text should change to "copied to the new season"
    await expect(
      dialog.getByText(/all current player assignments will be copied/i),
    ).toBeVisible();
  });

  test('Cancel button closes the dialog without calling RenewLeague @critical', async ({
    page,
  }) => {
    let mutationCalled = false;
    await setupGraphQL(page, {
      onRenewLeague: () => {
        mutationCalled = true;
        return makeNewLeague();
      },
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    // Tamagui's Dialog.Close with asChild may alter the button's ARIA
    // role depending on the rendering mode.  Use a tag-based locator
    // instead of getByRole to reliably find the Cancel button.
    await dialog.locator('button', { hasText: 'Cancel' }).click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // Mutation must NOT have fired
    expect(mutationCalled).toBe(false);
  });
});

// ── Tests: Confirmation & Mutation ────────────────────────────────────────────

test.describe('Season Renewal — Confirm and Navigate @critical', () => {
  test('confirming renewal calls RenewLeague mutation and navigates to new league @critical', async ({
    page,
  }) => {
    let mutationCalled = false;
    await setupGraphQL(page, {
      onRenewLeague: () => {
        mutationCalled = true;
        return makeNewLeague(2);
      },
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /confirm new season/i }).click();

    // Mutation should be called
    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);

    // Should navigate to the new league page
    await page.waitForURL(/\/baseball\/league\/2/);
  });

  test('confirm button shows "Creating new season..." while loading @regression', async ({
    page,
  }) => {
    // Slow mutation so we can catch the loading state on the confirm button
    await setupGraphQL(page, { renewLeagueDelay: 1500 });

    await page.goto('/baseball/league/1/commissioner');
    await page.getByRole('button', { name: /start new season/i }).click();

    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /confirm new season/i }).click();

    // Loading text appears on the confirm button before the mutation resolves
    await expect(dialog.getByText(/creating new season/i)).toBeVisible();
  });
});
