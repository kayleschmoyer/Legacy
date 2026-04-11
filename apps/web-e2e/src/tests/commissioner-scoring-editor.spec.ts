/**
 * E2E Tests: Commissioner Scoring Editor (LS-681)
 *
 * Covers the LeagueScoringEditor on the commissioner tab:
 *   /baseball/league/:id/commissioner → "Scoring" accordion section
 *
 *   - "Scoring Settings" heading renders
 *   - Loading state while profile fetches
 *   - Stat groups (Batting, Pitching, Fielding) render with input fields
 *   - "N unsaved" badge appears when values are changed
 *   - Save triggers UpdateLeagueScoringProfile mutation
 *   - Error state when GetLeagueScoringProfile fails
 *   - Empty state when profile has no stats
 *   - Locked state when draftStatus === 'completed'
 *   - Reset clears pending changes
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
    name: 'Test League',
    description: 'E2E scoring editor test',
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

/** A realistic scoring profile with one stat from each of the three groups. */
function makeScoringProfile(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'ScoringConfig',
    profileId: 1,
    profileName: 'Standard',
    stats: [
      // Batting stat
      {
        __typename: 'ScoringRule',
        multiplier: 1,
        defaultMultiplier: 1,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 1,
          statKey: 'hr',
          statGroup: 'batting',
          displayName: 'Home Runs',
          description: 'Home run bonus',
          sourceColumn: 'homeRuns',
          defaultMultiplier: 1,
          minMultiplier: 0,
          maxMultiplier: 10,
          stepSize: 0.5,
          isRequired: false,
          enforcePositive: false,
          enforceNegative: false,
        },
      },
      // Pitching stat
      {
        __typename: 'ScoringRule',
        multiplier: 1,
        defaultMultiplier: 1,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 2,
          statKey: 'so',
          statGroup: 'pitching',
          displayName: 'Strikeouts (Pitching)',
          description: 'Strikeout bonus for pitchers',
          sourceColumn: 'strikeouts',
          defaultMultiplier: 1,
          minMultiplier: 0,
          maxMultiplier: 10,
          stepSize: 0.25,
          isRequired: false,
          enforcePositive: false,
          enforceNegative: false,
        },
      },
      // Fielding stat
      {
        __typename: 'ScoringRule',
        multiplier: -1,
        defaultMultiplier: -1,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 3,
          statKey: 'e',
          statGroup: 'fielding',
          displayName: 'Errors',
          description: 'Penalty for fielding errors',
          sourceColumn: 'errors',
          defaultMultiplier: -1,
          minMultiplier: -10,
          maxMultiplier: 0,
          stepSize: 0.5,
          isRequired: false,
          enforcePositive: false,
          enforceNegative: true,
        },
      },
    ],
    multiplierGroups: [],
    ...overrides,
  };
}

// ── GraphQL mock setup ─────────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeLeague>;
  scoringProfile?: ReturnType<typeof makeScoringProfile> | null;
  scoringProfileDelay?: number;
  scoringProfileError?: boolean;
  /** Artificial delay (ms) before fulfilling UpdateLeagueScoringProfile. */
  updateScoringProfileDelay?: number;
  onUpdateScoringProfile?: (variables: Record<string, unknown>) => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeLeague(),
    scoringProfile = makeScoringProfile(),
    scoringProfileDelay,
    scoringProfileError = false,
    updateScoringProfileDelay,
    onUpdateScoringProfile,
  } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: Record<string, unknown>;
      };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league } }),
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
          body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
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
        if (scoringProfileDelay) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, scoringProfileDelay),
          );
        }
        if (scoringProfileError) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [{ message: 'Failed to fetch scoring profile' }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { leagueScoringProfile: scoringProfile },
          }),
        });
        return;
      }
      if (op === 'UpdateLeagueScoringProfile') {
        if (updateScoringProfileDelay) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, updateScoringProfileDelay),
          );
        }
        const result =
          onUpdateScoringProfile?.(body.variables ?? {}) ??
          makeScoringProfile();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { updateLeagueScoringProfile: result },
          }),
        });
        return;
      }

      // Fall through to the baseline _apiIsolation fixture for ambient
      // queries (getUnreadNotificationCount, getUserById, etc.)
      await unmockedGraphQLFallback(route);
    },
  );
}

/** Expand the "Scoring" accordion on the commissioner tab. */
async function expandScoringSection(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: 'Scoring', exact: true });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Commissioner Scoring Editor @critical', () => {
  test('shows "Scoring Settings" heading when section is expanded @smoke', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    await expect(page.getByText('Scoring Settings')).toBeVisible();
  });

  test('renders Batting, Pitching, and Fielding group headers @smoke', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });
    await expect(
      scoringRegion.getByText('Batting', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Pitching', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Fielding', { exact: true }),
    ).toBeVisible();
  });

  test('renders stat display names from the profile @regression', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    await expect(
      scoringRegion.getByText('Home Runs', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Strikeouts (Pitching)', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Errors', { exact: true }),
    ).toBeVisible();
  });

  test('renders multiplier input fields for each stat @regression', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    // Each stat row has a text input for its multiplier value
    const inputs = scoringRegion.locator(
      'input[type="text"], input:not([type])',
    );
    await expect(inputs.first()).toBeVisible();
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('shows loading state while scoring profile fetches @regression', async ({
    page,
  }) => {
    // Use a long delay so the loading state is still visible after navigation + section expansion
    await setupGraphQL(page, { scoringProfileDelay: 5000 });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    // Loading text is visible before the profile resolves
    await expect(page.getByText(/loading scoring profile/i)).toBeVisible({
      timeout: 3000,
    });

    // Eventually resolves
    await expect(page.getByText(/loading scoring profile/i)).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('shows error banner when GetLeagueScoringProfile fails @regression', async ({
    page,
  }) => {
    await setupGraphQL(page, { scoringProfileError: true });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    await expect(
      page.getByText(/Failed to load scoring profile/i),
    ).toBeVisible();
  });

  test('shows empty state when profile has no stats @regression', async ({
    page,
  }) => {
    const emptyProfile = {
      __typename: 'ScoringConfig',
      profileId: 1,
      profileName: 'Empty',
      stats: [],
      multiplierGroups: [],
    };
    await setupGraphQL(page, { scoringProfile: emptyProfile });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    await expect(
      page.getByText(/No scoring stats are available yet/i),
    ).toBeVisible();
  });

  test('shows empty state when profile is null @regression', async ({
    page,
  }) => {
    await setupGraphQL(page, { scoringProfile: null });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    await expect(
      page.getByText(/No scoring stats are available yet/i),
    ).toBeVisible();
  });
});

test.describe('Commissioner Scoring Editor — Locked State @critical', () => {
  test('shows locked message when draft is completed', async ({ page }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });
    await expect(
      scoringRegion.getByText(
        /Scoring settings are locked while the season is in progress/i,
      ),
    ).toBeVisible();
  });

  test('header subtitle changes to locked message when draft is completed', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    await expect(
      page.getByText(/Scoring is locked — the season is in progress/i),
    ).toBeVisible();
  });

  test('stat groups still render in locked state for viewing', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });
    await expect(
      scoringRegion.getByText('Batting', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Pitching', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Fielding', { exact: true }),
    ).toBeVisible();
  });
});

test.describe('Commissioner Scoring Editor — Editing @critical', () => {
  test('shows "N unsaved" badge when a multiplier is changed @critical', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    // Find the first input and change its value
    const firstInput = scoringRegion
      .locator('input[type="text"], input:not([type])')
      .first();
    await expect(firstInput).toBeVisible();
    await firstInput.fill('3');
    await firstInput.blur();

    // The "unsaved" badge should appear
    await expect(scoringRegion.getByText(/unsaved/i)).toBeVisible();
  });

  test('calls UpdateLeagueScoringProfile mutation on save @critical', async ({
    page,
  }) => {
    let mutationCalled = false;
    await setupGraphQL(page, {
      onUpdateScoringProfile: () => {
        mutationCalled = true;
        return makeScoringProfile();
      },
    });

    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    // Change a multiplier to enable save
    const firstInput = scoringRegion
      .locator('input[type="text"], input:not([type])')
      .first();
    await firstInput.fill('3');
    await firstInput.blur();

    // Wait for "unsaved" badge then click Save
    await expect(scoringRegion.getByText(/unsaved/i)).toBeVisible();
    const saveButton = scoringRegion.getByRole('button', {
      name: /^Save/,
    });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Mutation should have been called
    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);
  });

  test('"unsaved" badge disappears after save completes @critical', async ({
    page,
  }) => {
    // Hermetic equivalent of integration test Phase 3 (LS-2957).
    // Verifies that:
    //   (a) The badge clears optimistically when save is initiated.
    //   (b) The badge stays hidden after the full save + refetch cycle,
    //       catching the LS-2957 regression where skippedSyncRef replayed
    //       stale closure stats and made the badge reappear.
    const UPDATED_MULTIPLIER = 3;

    // The mutation mock adds a short delay so the "Saving…" button state is
    // reliably observable. The mutation returns a realistic updated profile
    // reflecting the submitted multiplier (derived from mutation variables).
    // The stateless GetLeagueScoringProfile refetch still returns the original
    // profile, exercising the skippedSyncRef replay path: statsRef.current
    // (updated by the refetch render) is used instead of the stale closure to
    // avoid reintroducing pendingUpdates.
    await setupGraphQL(page, {
      updateScoringProfileDelay: 200,
      onUpdateScoringProfile: (variables) => {
        const updates = (
          variables as {
            updates?: Array<{ statId: number; multiplier: number }>;
          }
        ).updates;
        const hrUpdate = updates?.find((u) => u.statId === 1);
        const hrMultiplier = hrUpdate?.multiplier ?? UPDATED_MULTIPLIER;
        return makeScoringProfile({
          stats: [
            {
              __typename: 'ScoringRule',
              multiplier: hrMultiplier,
              defaultMultiplier: 1,
              isOverride: hrMultiplier !== 1,
              isEnabled: true,
              definition: {
                __typename: 'ScoringStatDefinition',
                id: 1,
                statKey: 'hr',
                statGroup: 'batting',
                displayName: 'Home Runs',
                description: 'Home run bonus',
                sourceColumn: 'homeRuns',
                defaultMultiplier: 1,
                minMultiplier: 0,
                maxMultiplier: 10,
                stepSize: 0.5,
                isRequired: false,
                enforcePositive: false,
                enforceNegative: false,
              },
            },
          ],
        });
      },
    });

    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });
    const unsavedBadge = scoringRegion.getByText(/unsaved/i);

    // Change the Home Runs multiplier
    const hrInput = scoringRegion.getByRole('textbox', {
      name: 'Home Runs multiplier',
    });
    await hrInput.fill(String(UPDATED_MULTIPLIER));
    await hrInput.blur();

    // Badge appears
    await expect(unsavedBadge).toBeVisible();

    // Click Save and wait for the "Saving…" button state to appear, confirming
    // the async save path was entered (guards against a false pass if the
    // mutation completes before the assertion runs).
    const saveButton = scoringRegion.getByRole('button', { name: /^Save/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    // The badge clears optimistically on click.
    await expect(unsavedBadge).not.toBeVisible({ timeout: 5_000 });

    // Wait for the save cycle to complete: the Save button transitions through
    // "Saving…" back to its default label when mutation + refetch both finish.
    // Scope the locator to scoringRegion to avoid matching unrelated buttons.
    const savingButton = scoringRegion.getByRole('button', { name: /saving/i });
    // First confirm the "Saving…" state is reached (proves the async path ran).
    await expect(savingButton).toBeVisible({ timeout: 5_000 });
    // Then wait for it to disappear (mutation + refetch cycle complete).
    await expect(savingButton).not.toBeVisible({ timeout: 10_000 });

    // Verify badge is still hidden after cache reconciliation — this is the
    // assertion that catches the LS-2957 regression.
    await expect(unsavedBadge).not.toBeVisible();
  });

  test('reset button clears pending changes @regression', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    // Change a multiplier
    const firstInput = scoringRegion
      .locator('input[type="text"], input:not([type])')
      .first();
    await firstInput.fill('5');
    await firstInput.blur();

    // Confirm "unsaved" badge is present
    await expect(scoringRegion.getByText(/unsaved/i)).toBeVisible();

    // Click the reset button
    const resetButton = scoringRegion.getByRole('button', {
      name: /reset all/i,
    });
    await expect(resetButton).toBeVisible();
    await resetButton.click();

    // "unsaved" badge should disappear
    await expect(scoringRegion.getByText(/unsaved/i)).not.toBeVisible();
  });

  test('collapsing a group hides its stat rows @regression', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByRole('region', { name: 'Scoring' });

    // The "Home Runs" stat is in the Batting group — visible by default
    await expect(
      scoringRegion.getByText('Home Runs', { exact: true }),
    ).toBeVisible();

    // Click the Batting group header to collapse it.  The group header has
    // `role="button"` and `aria-label`, so we locate it by accessible role.
    // Using getByTestId on Tamagui XStack is unreliable — data-testid may
    // not propagate to the DOM in all build configurations.
    const battingHeader = scoringRegion.getByRole('button', {
      name: /batting scoring group/i,
    });
    await battingHeader.click();

    // The collapse animates via CSS grid (`grid-template-rows: 0fr`) with a
    // 300 ms transition.  The component also sets `visibility: hidden` with a
    // matching 300 ms delay so Playwright reliably detects the hidden state.
    // Wait for aria-expanded to flip, then let the 300 ms CSS transition and
    // visibility delay complete — expect() polls until the element is hidden.
    await expect(battingHeader).toHaveAttribute('aria-expanded', 'false');
    await expect(
      scoringRegion.getByText('Home Runs', { exact: true }),
    ).not.toBeVisible();
  });
});
