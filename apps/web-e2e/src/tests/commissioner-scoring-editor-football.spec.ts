/**
 * E2E Tests: Football Commissioner Scoring Editor (LS-9042)
 *
 * Covers the ScoringSettingsEditor on the commissioner tab for football
 * leagues: /baseball/league/:id/commissioner → "Scoring Rules" accordion.
 *
 *   - No "Coming Soon" badge / disabled state for football leagues (AC1)
 *   - DST leagues render the "Defense / Special Teams (D/ST)" group; IDP
 *     leagues render "Individual Defensive Players (IDP)" instead
 *   - Save triggers the UpdateLeagueScoringProfile mutation (AC3)
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

function makeFootballLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Test Football League',
    description: 'E2E football scoring editor test',
    owner: 1,
    sport: 'football',
    defensiveFormat: 'dst',
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
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 1,
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

/** A realistic football scoring profile covering passing + DST/IDP groups. */
function makeFootballScoringProfile(
  overrides: Record<string, unknown> = {},
  defensiveGroup: 'defense' | 'idp' = 'defense',
) {
  const defensiveStat =
    defensiveGroup === 'defense'
      ? {
          __typename: 'ScoringRule',
          multiplier: 1,
          defaultMultiplier: 1,
          isOverride: false,
          isEnabled: true,
          definition: {
            __typename: 'ScoringStatDefinition',
            id: 2,
            statKey: 'dst_sack',
            statGroup: 'defense',
            displayName: 'Sack',
            description: 'D/ST sack bonus',
            sourceColumn: 'dstSack',
            defaultMultiplier: 1,
            minMultiplier: 0,
            maxMultiplier: 10,
            stepSize: 0.5,
            isRequired: false,
            enforcePositive: false,
            enforceNegative: false,
          },
        }
      : {
          __typename: 'ScoringRule',
          multiplier: 1,
          defaultMultiplier: 1,
          isOverride: false,
          isEnabled: true,
          definition: {
            __typename: 'ScoringStatDefinition',
            id: 2,
            statKey: 'idp_solo_tkl',
            statGroup: 'idp',
            displayName: 'Solo Tackle',
            description: 'IDP solo tackle bonus',
            sourceColumn: 'idpSoloTkl',
            defaultMultiplier: 1,
            minMultiplier: 0,
            maxMultiplier: 10,
            stepSize: 0.5,
            isRequired: false,
            enforcePositive: false,
            enforceNegative: false,
          },
        };

  return {
    __typename: 'ScoringConfig',
    profileId: 1,
    profileName: 'Standard',
    stats: [
      {
        __typename: 'ScoringRule',
        multiplier: 4,
        defaultMultiplier: 4,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 1,
          statKey: 'passing_td',
          statGroup: 'passing',
          displayName: 'Passing TD',
          description: 'Passing touchdown bonus',
          sourceColumn: 'passingTd',
          defaultMultiplier: 4,
          minMultiplier: 0,
          maxMultiplier: 10,
          stepSize: 1,
          isRequired: false,
          enforcePositive: false,
          enforceNegative: false,
        },
      },
      defensiveStat,
    ],
    multiplierGroups: [],
    ...overrides,
  };
}

interface SetupOptions {
  league?: ReturnType<typeof makeFootballLeague>;
  scoringProfile?: ReturnType<typeof makeFootballScoringProfile> | null;
  onUpdateScoringProfile?: (variables: Record<string, unknown>) => unknown;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeFootballLeague(),
    scoringProfile = makeFootballScoringProfile(),
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
        const result =
          onUpdateScoringProfile?.(body.variables ?? {}) ??
          makeFootballScoringProfile();
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

/** Expand the "Scoring Rules" accordion on the commissioner tab. */
async function expandScoringSection(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', {
    name: 'Scoring Rules',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Commissioner Scoring Editor — Football @critical', () => {
  test('no "Coming Soon" badge for a football league and the accordion is not disabled (AC1)', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');

    await expect(page.getByText('Coming Soon')).not.toBeVisible();
    const toggle = page.getByRole('button', {
      name: 'Scoring Rules',
      exact: true,
    });
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('renders the Passing and D/ST groups for a DST football league @smoke', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByTestId('scoring-editor');
    await expect(
      scoringRegion.getByText('Passing', { exact: true }),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Defense / Special Teams (D/ST)'),
    ).toBeVisible();
  });

  test('renders the IDP group instead of D/ST for an IDP football league', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: makeFootballLeague({ defensiveFormat: 'idp' }),
      scoringProfile: makeFootballScoringProfile({}, 'idp'),
    });
    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByTestId('scoring-editor');
    await expect(
      scoringRegion.getByText('Individual Defensive Players (IDP)'),
    ).toBeVisible();
    await expect(
      scoringRegion.getByText('Defense / Special Teams (D/ST)'),
    ).not.toBeVisible();
  });

  test('calls UpdateLeagueScoringProfile mutation on save (AC3)', async ({
    page,
  }) => {
    let mutationCalled = false;
    await setupGraphQL(page, {
      onUpdateScoringProfile: () => {
        mutationCalled = true;
        return makeFootballScoringProfile();
      },
    });

    await page.goto('/baseball/league/1/commissioner');
    await expandScoringSection(page);

    const scoringRegion = page.getByTestId('scoring-editor');

    const firstInput = scoringRegion
      .locator('input[type="text"], input:not([type])')
      .first();
    await firstInput.fill('6');
    await firstInput.blur();

    await expect(scoringRegion.getByText(/unsaved/i)).toBeVisible();
    const saveButton = scoringRegion.getByRole('button', { name: /^Save/ });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    await expect.poll(() => mutationCalled, { timeout: 5000 }).toBe(true);
  });
});
