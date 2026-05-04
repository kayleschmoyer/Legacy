/**
 * Season Renewal Flow — Core Tests (LS-690)
 *
 * Validates the core season renewal flow:
 *   1. Commissioner creates a renewal league from a completed season
 *   2. Settings are inherited from the original league
 *
 * All GraphQL operations are mocked — no live backend required.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
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

// ── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_ID = 500;
const LEAGUE_NAME = 'Dynasty Legends';
const NEW_LEAGUE_ID = 501;
const NEW_LEAGUE_NAME = 'Dynasty Legends';

// ── Mock Data Factories ──────────────────────────────────────────────────────

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: LEAGUE_NAME,
    description: 'Season renewal flow test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'automated',
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
    inviteCode: 'RENEW5678',
    userMembership: { teamId: 10 },
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
    seasonNumber: 1,
    previousLeagueId: null,
    ...overrides,
  };
}

/** Renewed league inherits settings from the original. */
function makeRenewedLeague(overrides: Record<string, unknown> = {}) {
  return {
    ...makeLeague({
      id: NEW_LEAGUE_ID,
      name: NEW_LEAGUE_NAME,
      draftStatus: 'not-started',
      currentMatchup: null,
      frozenAt: null,
      seasonNumber: 2,
      previousLeagueId: LEAGUE_ID,
      inviteCode: 'RENEW9999',
      userMembership: { teamId: 20 },
    }),
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 10,
    name: 'Dynasty Kings',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 11,
    name: 'The Sluggers',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 12,
    name: 'Ace Armada',
    owner: 3,
    leagueId: LEAGUE_ID,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 13,
    name: 'Power Hitters',
    owner: 4,
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** Teams migrated to the new league — same names, new IDs. */
const MIGRATED_TEAMS = MOCK_TEAMS.map((team, i) => ({
  ...team,
  id: 20 + i,
  leagueId: NEW_LEAGUE_ID,
}));

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
  { __typename: 'LeaguePosition', id: 3, name: 'Shortstop', abbrev: 'SS' },
  {
    __typename: 'LeaguePosition',
    id: 4,
    name: 'Starting Pitcher',
    abbrev: 'SP',
  },
];

/** All 10 weeks completed — season is done. */
function makeCompletedMatchups() {
  return Array.from({ length: 10 }, (_, i) => ({
    __typename: 'Matchup',
    id: i + 1,
    leagueId: LEAGUE_ID,
    weekNumber: i + 1,
    team1Id: 10,
    team2Id: 11,
    status: 'completed',
    selectedGamesCount: 5,
    gamesPerMatchup: 5,
    statsLoadingStatus: 'not_started',
  }));
}

// ── GraphQL Route Setup ──────────────────────────────────────────────────────

interface MockOptions {
  league?: ReturnType<typeof makeLeague>;
  teams?: typeof MOCK_TEAMS;
  matchups?: Array<Record<string, unknown>>;
  renewedLeague?: ReturnType<typeof makeRenewedLeague>;
  renewedTeams?: typeof MIGRATED_TEAMS;
  onRenewLeague?: (variables: {
    keepRosters: boolean;
  }) =>
    | Record<string, unknown>
    | null
    | Promise<Record<string, unknown> | null>;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    league = makeLeague(),
    teams = MOCK_TEAMS,
    matchups = makeCompletedMatchups(),
    renewedLeague = makeRenewedLeague(),
    renewedTeams = MIGRATED_TEAMS,
    onRenewLeague,
  } = opts;

  /** Track which league we're currently viewing — changes after renewal. */
  let activeLeagueId = league.id;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData() ?? '';
    let parsed: { operationName?: string; variables?: Record<string, unknown> };
    try {
      parsed = JSON.parse(postData) as typeof parsed;
    } catch {
      parsed = {};
    }
    const op = (parsed.operationName ?? '').toLowerCase();
    const rawOp = parsed.operationName ?? '';

    // ── League queries ────────────────────────────────────────────
    if (op === 'getleaguebyid' || op === 'getleague') {
      const requestedId =
        (parsed.variables?.['id'] as number) ??
        (parsed.variables?.['leagueId'] as number) ??
        activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { league: isNewLeague ? renewedLeague : league },
        }),
      });
      return;
    }

    if (op === 'getleagueteams') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leagueTeams: isNewLeague ? renewedTeams : teams },
        }),
      });
      return;
    }

    if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
      return;
    }

    if (op === 'getuserteamid') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: isNewLeague ? 20 : 10 },
        }),
      });
      return;
    }

    if (op === 'getmatchupsforleague') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupsForLeague: isNewLeague ? [] : matchups,
          },
        }),
      });
      return;
    }

    if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: null },
        }),
      });
      return;
    }

    if (op === 'getleaguedraft' || op === 'getleaguedraftquery') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              draftMode: isNewLeague ? 'automated' : 'automated',
            },
          },
        }),
      });
      return;
    }

    if (op === 'getuserleagues' || op === 'getusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
      return;
    }

    if (op === 'getdraftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
      });
      return;
    }

    // ── Activity / chat / announcements ───────────────────────────
    if (
      op === 'getleagueactivity' ||
      op === 'leagueactivity' ||
      op === 'getleaguechatmessages' ||
      op === 'getleaguemessages' ||
      op === 'getleagueannouncements'
    ) {
      const key =
        op.includes('chat') || op.includes('messages')
          ? 'getLeagueMessages'
          : op.includes('announcement')
            ? 'getLeagueAnnouncements'
            : 'leagueActivity';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [key]: [] } }),
      });
      return;
    }

    // ── Standings / scoring / trades / waivers ────────────────────
    if (op === 'getleaguestandings' || op === 'leaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
      return;
    }

    if (op === 'getleaguescoring' || op === 'leaguescoringprofile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
      return;
    }

    if (op === 'getpendingtradeoffers' || op === 'pendingtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
      return;
    }

    if (op === 'getteamwaiverclaims' || op === 'teamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
      return;
    }

    if (op === 'getteammembers' || op === 'teammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
      return;
    }

    if (op === 'getmatchupbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: null } }),
      });
      return;
    }

    if (op === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
      return;
    }

    // ── RenewLeague mutation ──────────────────────────────────────
    if (op === 'renewleague') {
      if (onRenewLeague) {
        const result = await onRenewLeague({
          keepRosters: parsed.variables?.['keepRosters'] as boolean,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { renewLeague: result ?? renewedLeague },
          }),
        });
      } else {
        // After renewal succeeds, switch to showing the new league
        activeLeagueId = NEW_LEAGUE_ID;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { renewLeague: renewedLeague } }),
        });
      }
      return;
    }

    // ── Fallback — surface any unmocked operation as a diagnostic error ──
    await unmockedGraphQLFallback(route);
  });
}

// ── Test Suite: Commissioner Creates Renewal League ──────────────────────────

test.describe('Season Renewal Flow — commissioner creates renewal league @critical', () => {
  test('commissioner opens renewal dialog and confirms new season with draft', async ({
    page,
  }) => {
    let renewalMutationCalled = false;
    let capturedKeepRosters: boolean | undefined;

    await setupGraphQL(page, {
      onRenewLeague: ({ keepRosters }) => {
        renewalMutationCalled = true;
        capturedKeepRosters = keepRosters;
        return makeRenewedLeague();
      },
    });

    // Navigate to commissioner tab of completed-season league
    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Verify season complete UI is visible
    await expect(
      page.getByText('Season Complete', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/All weeks have been played/i).first(),
    ).toBeVisible();

    // Click "Start New Season"
    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Verify renewal dialog appears
    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify dialog description about freezing
    await expect(
      page.getByText(/frozen and kept as a historical record/i).first(),
    ).toBeVisible();

    // Verify roster options
    await expect(
      page.getByText(/How should rosters be handled/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Hold a new draft/i).first()).toBeVisible();
    await expect(page.getByText(/Keep same rosters/i).first()).toBeVisible();

    // Default is "Hold a new draft" — verify hint text
    await expect(
      page
        .getByText(
          /All team rosters will be cleared.*commissioner can configure/i,
        )
        .first(),
    ).toBeVisible();

    // Click "Confirm New Season"
    const confirmBtn = page.getByRole('button', {
      name: /Confirm New Season/i,
    });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify the RenewLeague mutation was called with keepRosters=false
    await expect
      .poll(() => renewalMutationCalled, { timeout: 10_000 })
      .toBe(true);
    expect(capturedKeepRosters).toBe(false);

    // Verify navigation to the new league
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${NEW_LEAGUE_ID}`),
      { timeout: 15_000 },
    );
  });

  test('commissioner creates renewal league with roster carry-over', async ({
    page,
  }) => {
    let capturedKeepRosters: boolean | undefined;

    await setupGraphQL(page, {
      onRenewLeague: ({ keepRosters }) => {
        capturedKeepRosters = keepRosters;
        return makeRenewedLeague({ draftStatus: 'completed' });
      },
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Open renewal dialog
    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Select "Keep same rosters"
    await page
      .getByText(/Keep same rosters/i)
      .first()
      .click();

    // Verify hint text updates
    await expect(
      page.getByText(/All current player assignments will be copied/i).first(),
    ).toBeVisible();

    // Confirm renewal
    await page.getByRole('button', { name: /Confirm New Season/i }).click();

    // Verify the mutation was called with keepRosters=true
    await expect
      .poll(() => capturedKeepRosters, { timeout: 10_000 })
      .toBe(true);

    // Verify navigation to new league
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${NEW_LEAGUE_ID}`),
      { timeout: 15_000 },
    );
  });

  test('renewal dialog cancel does not trigger mutation', async ({ page }) => {
    let renewalMutationCalled = false;

    await setupGraphQL(page, {
      onRenewLeague: () => {
        renewalMutationCalled = true;
        return makeRenewedLeague();
      },
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Open renewal dialog
    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Wait for dialog content to fully render (portal + animation), then cancel.
    // Tamagui Dialog.Close with asChild renders the button's accessible name as
    // "Dialog Close" rather than the child text, so match on that.
    const cancelBtn = page.getByRole('button', { name: /Dialog Close/i });
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.click();

    // Dialog should close
    await expect(page.getByText(/Start New Season for/i)).not.toBeVisible({
      timeout: 5_000,
    });

    // Mutation should NOT have been called
    expect(renewalMutationCalled).toBe(false);

    // Still on the same page
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${LEAGUE_ID}/commissioner`),
    );
  });

  test('renewal shows loading state during mutation', async ({ page }) => {
    // Use a deferred promise so we can observe the in-flight loading state
    let resolveRenewal!: () => void;
    const renewalGate = new Promise<void>((r) => {
      resolveRenewal = r;
    });

    await setupGraphQL(page, {
      onRenewLeague: async () => {
        await renewalGate;
        return makeRenewedLeague();
      },
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Click confirm to trigger the mutation (which is now held open)
    const confirmBtn = page.getByRole('button', {
      name: /Confirm New Season/i,
    });
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();

    // While the mutation is in-flight, the button text changes to
    // "Creating new season..." — use a locator that matches the loading label.
    const loadingBtn = page.getByRole('button', {
      name: /Creating new season/i,
    });
    await expect(loadingBtn).toBeDisabled({ timeout: 5_000 });

    // Release the mutation so the flow can complete
    resolveRenewal();

    // Verify navigation completes to new league
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${NEW_LEAGUE_ID}`),
      { timeout: 15_000 },
    );
  });
});

// ── Test Suite: Settings Inheritance ─────────────────────────────────────────

test.describe('Season Renewal Flow — settings inheritance @critical', () => {
  test('renewed league inherits settings from original league', async ({
    page,
  }) => {
    const originalLeague = makeLeague({
      gamesPerMatchup: 7,
      spStartsPerMatchup: 2,
      totalMatchups: 12,
      maxBatters: 16,
      maxPitchers: 11,
      tradingEnabled: true,
      waiverEnabled: true,
      playoffEnabled: true,
      playoffFormat: '4-team',
      minCareerGames: 100,
      minCareerSeasons: 5,
      numberOfTeams: 4,
    });

    // The renewed league should reflect the same settings
    const renewedLeague = makeRenewedLeague({
      gamesPerMatchup: 7,
      spStartsPerMatchup: 2,
      totalMatchups: 12,
      maxBatters: 16,
      maxPitchers: 11,
      tradingEnabled: true,
      waiverEnabled: true,
      playoffEnabled: true,
      playoffFormat: '4-team',
      minCareerGames: 100,
      minCareerSeasons: 5,
      numberOfTeams: 4,
    });

    // Provide 12 completed matchups to match totalMatchups: 12 so the
    // "season complete" condition is satisfied and the renewal button appears.
    const completedMatchups = Array.from({ length: 12 }, (_, i) => ({
      __typename: 'Matchup' as const,
      id: i + 1,
      leagueId: LEAGUE_ID,
      weekNumber: i + 1,
      team1Id: 10,
      team2Id: 11,
      status: 'completed',
      selectedGamesCount: 7,
      gamesPerMatchup: 7,
      statsLoadingStatus: 'not_started',
    }));

    await setupGraphQL(page, {
      league: originalLeague,
      renewedLeague,
      matchups: completedMatchups,
    });

    // First: trigger renewal via commissioner tab
    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const confirmBtn = page.getByRole('button', {
      name: /Confirm New Season/i,
    });
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();

    // Navigate to the new league after renewal
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${NEW_LEAGUE_ID}`),
      { timeout: 15_000 },
    );

    // Navigate to the new league's commissioner tab to verify settings
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // The new league should NOT be frozen, so the commissioner can manage it
    // Verify the page does not show an error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Verify the league name is displayed (inherited)
    await expect(
      page.getByText(NEW_LEAGUE_NAME, { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Expand the "League Settings" accordion section (collapsed by default).
    // Use getByRole instead of getByTestId because the CommissionerSectionHeader
    // is a Tamagui styled() component that may not forward data-testid to the DOM.
    const leagueSettingsToggle = page.getByRole('button', {
      name: /League Settings/,
    });
    await expect(leagueSettingsToggle).toBeVisible({ timeout: 10_000 });
    await leagueSettingsToggle.click();

    // Verify key inherited settings sections are visible on the commissioner UI
    await expect(page.getByText(/Games Per Matchup/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Minimum Career Games/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renewed league shows season 2 with pre-draft status', async ({
    page,
  }) => {
    await setupGraphQL(page);

    // Navigate directly to the new league's overview after renewal
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    // Verify no error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The renewed league has draftStatus='not-started' — expect Pre-Draft badge
    await expect(page.getByText('Pre-Draft').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('original league is hidden behind frozen state after renewal', async ({
    page,
  }) => {
    // After renewal, the original league is frozen
    const frozenLeague = makeLeague({
      frozenAt: '2025-06-01T00:00:00Z',
    });

    await setupGraphQL(page, {
      league: frozenLeague,
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Frozen league should NOT show "Start New Season" button
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
