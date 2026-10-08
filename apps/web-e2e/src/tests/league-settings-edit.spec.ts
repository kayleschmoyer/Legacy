/**
 * League Settings Edit — E2E Tests (LS-2112)
 *
 * Covers post-creation editing of commissioner league settings that
 * `commissioner-league-settings.spec.ts` (LS-682) does not exercise:
 *
 *   - Waiver System: switching Standard <-> FAAB, editing the FAAB budget
 *   - Salary Cap: enabling it and setting a salary cap limit
 *   - Draft Settings: draft mode, selection method, draft order, player
 *     pool, pick timer, and locked state once the draft has started
 *
 * League name, visibility, roster size, and divisions were scoped out —
 * this codebase has no post-creation edit UI or mutation for those fields
 * (see the LS-2112 Jira comment for the audit). `updateLeagueSettings` and
 * `updateDraftSettings` cover everything that is actually editable.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback, useTier } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Salary Cap and Draft Settings are both wrapped in a PremiumGate, and
// selecting the FAAB waiver option requires premium too (a free viewer's tap
// routes to the upgrade flow instead of switching) — every test in this file
// needs premium so it reaches the controls under test rather than a locked
// upsell card. `useTier` must run before `page.goto()`.
test.beforeEach(async ({ page }) => {
  await useTier(page, 'premium');
});

// ── Mock Data ─────────────────────────────────────────────────────────────────

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test League',
    description: 'E2E league settings edit test',
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
    pitcherStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    salaryCapEnabled: false,
    salaryCap: null,
    faabBudgetDefault: 100,
    rosterContinuity: 'redraft',
    eraFilter: 'all',
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
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
];

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Draft',
    id: 1,
    leagueId: 1,
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    currentPick: 0,
    pickTimeLimitSeconds: 120,
    draftStartedAt: null,
    draftCompletedAt: null,
    scheduledAt: null,
    ...overrides,
  };
}

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    league?: ReturnType<typeof makeLeague>;
    draft?: ReturnType<typeof makeDraft>;
    onUpdateLeagueSettings?: (input: Record<string, unknown>) => unknown;
    onUpdateDraftSettings?: (input: Record<string, unknown>) => unknown;
  } = {},
) {
  const {
    league = makeLeague(),
    draft = makeDraft(),
    onUpdateLeagueSettings,
    onUpdateDraftSettings,
  } = opts;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as {
        operationName?: string;
        variables?: { input?: Record<string, unknown> };
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
          body: JSON.stringify({ data: { getLeagueDraft: draft } }),
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
      if (op === 'UpdateLeagueSettings') {
        const input = body.variables?.input ?? {};
        const result = onUpdateLeagueSettings?.(input) ?? {
          ...league,
          ...input,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { updateLeagueSettings: result } }),
        });
        return;
      }
      if (op === 'UpdateDraftSettings') {
        const input = body.variables?.input ?? {};
        const result = onUpdateDraftSettings?.(input) ?? {
          ...draft,
          ...input,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { updateDraftSettings: result } }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click the accordion header for the given section label so its content is visible. */
async function expandSection(
  page: import('@playwright/test').Page,
  label: string,
) {
  const toggle = page.getByRole('button', { name: label, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ── Tests: Waiver System & Salary Cap (League Settings section) ───────────────

test.describe('League Settings Edit — Waiver System @critical', () => {
  test('should default to Standard waiver system', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    // OptionButtonGroup (shared/_controls.tsx) conveys selection visually only
    // (border/background/font-weight) and renders no aria-pressed — the hint
    // text under the control mirrors the selected value instead.
    await expect(page.getByText('Teams have a priority order')).toBeVisible();
  });

  test('should switch to FAAB and reveal the FAAB budget field', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await page.getByTestId('create-league-waiver-type-faab').click();

    await expect(
      page.getByTestId('create-league-faab-budget-100'),
    ).toBeVisible();
  });

  test('should save an updated waiver type and FAAB budget via UpdateLeagueSettings', async ({
    page,
  }) => {
    let savedInput: Record<string, unknown> | null = null;
    await setupGraphQL(page, {
      onUpdateLeagueSettings: (input) => {
        savedInput = input;
        return { ...makeLeague(), ...input };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await page.getByTestId('create-league-waiver-type-faab').click();
    await page.getByTestId('create-league-faab-budget-200').click();
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect
      .poll(() => savedInput?.waiverType, { timeout: 5000 })
      .toBe('faab');
    await expect
      .poll(() => savedInput?.faabBudgetDefault, { timeout: 5000 })
      .toBe(200);
  });

  test('should revert waiver type changes on Reset', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await page.getByTestId('create-league-waiver-type-faab').click();
    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).toBeEnabled();

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.getByText('Teams have a priority order')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).toBeDisabled();
  });
});

test.describe('League Settings Edit — Salary Cap @critical', () => {
  test('should display the Enable Salary Cap toggle, unchecked by default', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await expect(page.getByText('Enable Salary Cap')).toBeVisible();
    await expect(page.getByText('Salary Cap Limit')).toHaveCount(0);
  });

  test('should reveal the Salary Cap Limit input once enabled', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await page.getByText('Enable Salary Cap').click();

    await expect(page.getByText('Salary Cap Limit')).toBeVisible();
  });

  test('should save salary cap enabled + limit via UpdateLeagueSettings', async ({
    page,
  }) => {
    let savedInput: Record<string, unknown> | null = null;
    await setupGraphQL(page, {
      onUpdateLeagueSettings: (input) => {
        savedInput = input;
        return { ...makeLeague(), ...input };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await page.getByText('Enable Salary Cap').click();
    await page.getByPlaceholder('e.g. 50000000').fill('75000000');
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect
      .poll(() => savedInput?.salaryCapEnabled, { timeout: 5000 })
      .toBe(true);
    await expect
      .poll(() => savedInput?.salaryCap, { timeout: 5000 })
      .toBe(75000000);
  });

  test('should send salaryCap: null when saving with the cap disabled', async ({
    page,
  }) => {
    let savedInput: Record<string, unknown> | null = null;
    await setupGraphQL(page, {
      league: makeLeague({ salaryCapEnabled: true, salaryCap: 50000000 }),
      onUpdateLeagueSettings: (input) => {
        savedInput = input;
        return { ...makeLeague(), ...input };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    // Disable the cap that was previously enabled.
    await page.getByText('Enable Salary Cap').click();
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect
      .poll(() => savedInput?.salaryCapEnabled, { timeout: 5000 })
      .toBe(false);
    await expect
      .poll(() => savedInput?.salaryCap, { timeout: 5000 })
      .toBeNull();
  });

  test('League Settings section is locked when draft is completed', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeLeague({ draftStatus: 'completed' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'League Settings');

    await expect(
      page.getByText(
        /League settings are locked while the season is in progress/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save Settings' }),
    ).toBeDisabled();
  });
});

// ── Tests: Draft Settings ───────────────────────────────────────────────────

test.describe('League Settings Edit — Draft Settings @critical', () => {
  test('should display current draft mode, selection method, and draft order', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await expect(page.getByTestId('option-live')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('option-standard').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('option-snake')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('should switch draft order to Linear and save via UpdateDraftSettings', async ({
    page,
  }) => {
    let savedInput: Record<string, unknown> | null = null;
    await setupGraphQL(page, {
      onUpdateDraftSettings: (input) => {
        savedInput = input;
        return { ...makeDraft(), ...input };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await page.getByTestId('option-linear').click();
    await page.getByRole('button', { name: 'Save Draft Settings' }).click();

    await expect
      .poll(() => savedInput?.draftOrder, { timeout: 5000 })
      .toBe('linear');
  });

  test('switching to Automated draft mode forces Random selection method', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await page.getByTestId('option-automated').click();

    await expect(page.getByTestId('option-random')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('should change the pick timer and save', async ({ page }) => {
    let savedInput: Record<string, unknown> | null = null;
    await setupGraphQL(page, {
      onUpdateDraftSettings: (input) => {
        savedInput = input;
        return { ...makeDraft(), ...input };
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await page.getByTestId('option-90').click();
    await page.getByRole('button', { name: 'Save Draft Settings' }).click();

    await expect
      .poll(() => savedInput?.pickTimeLimitSeconds, { timeout: 5000 })
      .toBe(90);
  });

  test('should revert changes on Reset', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await page.getByTestId('option-linear').click();
    await expect(
      page.getByRole('button', { name: 'Save Draft Settings' }),
    ).toBeEnabled();

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.getByTestId('option-snake')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByRole('button', { name: 'Save Draft Settings' }),
    ).toBeDisabled();
  });

  test('should lock all controls once the draft has started', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      draft: makeDraft({ draftStartedAt: '2026-01-01T00:00:00.000Z' }),
      league: makeLeague({ draftStatus: 'in-progress' }),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandSection(page, 'Draft Settings');

    await expect(
      page.getByText(/Draft settings are locked because the draft status is/),
    ).toBeVisible();
    await expect(page.getByTestId('option-linear')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Save Draft Settings' }),
    ).toHaveCount(0);
  });
});

// ── Tests: narrow-viewport layout (LS-10688) ──────────────────────────────────

test.describe('League Settings Edit — card subtitles at narrow widths', () => {
  // The card header text column used to keep Tamagui's default
  // flexShrink: 0, so the subtitle stayed one line wide and was clipped
  // by the card instead of wrapping.
  test.use({ viewport: { width: 375, height: 667 } });

  const subtitles = [
    {
      section: 'League Settings',
      text: 'Configure matchup settings for the league. Changes apply to future scheduled matchups.',
    },
    {
      section: 'Draft Settings',
      text: 'Configure your draft before it begins. Settings lock once the draft starts.',
    },
  ];

  for (const { section, text } of subtitles) {
    test(`${section} subtitle wraps inside the viewport`, async ({ page }) => {
      await setupGraphQL(page);
      await page.goto('/baseball/league/1/commissioner');
      await expandSection(page, section);

      const subtitle = page.getByText(text, { exact: true });
      await expect(subtitle).toBeVisible();
      const box = await subtitle.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    });
  }
});
