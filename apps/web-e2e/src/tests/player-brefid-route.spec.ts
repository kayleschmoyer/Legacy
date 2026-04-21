/**
 * E2E Tests: Player Detail Page — brefId deep-link route (LS-3813)
 *
 * Covers:
 *  - /players/:brefId resolves via GetPlayerIdByBrefId and opens the modal
 *  - unknown brefId shows the inline "No player found" alert (no modal)
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

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

const BREF_ID_FOUND_RESPONSE = {
  data: {
    playerByBrefId: {
      __typename: 'Player',
      id: 1,
      firstName: 'Mike',
      lastName: 'Trout',
    },
  },
};

const BREF_ID_NOT_FOUND_RESPONSE = {
  data: {
    playerByBrefId: null,
  },
};

const SEASON_STATS_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      eligiblePositions: ['CF', 'OF'],
      firstName: 'Mike',
      lastName: 'Trout',
    },
    playerSeasonBatting: [
      {
        __typename: 'SeasonBatting',
        season: 2024,
        team: 'LAA',
        games: 145,
        plateAppearances: 620,
        atBats: 550,
        runs: 95,
        hits: 165,
        doubles: 30,
        triples: 2,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        caughtStealing: 3,
        baseOnBalls: 60,
        strikeouts: 110,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
      },
    ],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
};

const CAREER_ARC_RESPONSE = {
  data: {
    player: {
      __typename: 'Player',
      firstName: 'Mike',
      lastName: 'Trout',
      eligiblePositions: ['CF', 'OF'],
      careerAchievements: {
        allStarSelections: 11,
        goldGloves: 0,
        silverSluggers: 9,
        mvpAwards: 3,
        cyYoungAwards: 0,
        hallOfFame: false,
        rookieOfTheYear: true,
      },
    },
    playerSeasonBatting: [
      {
        season: 2024,
        team: 'LAA',
        games: 145,
        hits: 165,
        atBats: 550,
        homeRuns: 28,
        rbi: 85,
        stolenBases: 12,
        battingAverage: 0.3,
        onBasePercentage: 0.37,
        sluggingPercentage: 0.52,
        onBasePlusSlugging: 0.89,
        onBasePlusSluggingPlus: 142,
        awardSummary: null,
      },
    ],
    playerSeasonPitching: [],
  },
};

// ── Route Setup ───────────────────────────────────────────────────────────────

interface SetupOptions {
  brefIdResponse?: object;
}

async function setupBrefIdMocks(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { brefIdResponse = BREF_ID_FOUND_RESPONSE } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getplayeridbybrefid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(brefIdResponse),
      });
    } else if (
      postData.includes('getplayercareerarc') ||
      postData.includes('careerarcquery')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAREER_ARC_RESPONSE),
      });
    } else if (postData.includes('getallplayerseasonsta')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEASON_STATS_RESPONSE),
      });
    } else {
      await route.fallback();
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Player Detail Page — brefId route @regression', () => {
  test('resolves brefId and opens the player detail modal', async ({
    page,
  }) => {
    await setupBrefIdMocks(page);
    await page.goto('/players/troutmi01');
    await page.waitForLoadState('networkidle');

    // Modal must be visible once brefId resolves to a numeric id
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Header should show the resolved player name
    await expect(dialog.getByText('Mike Trout').first()).toBeVisible();
  });

  test('shows player stats after brefId resolves', async ({ page }) => {
    await setupBrefIdMocks(page);
    await page.goto('/players/troutmi01');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-detail-loading')).not.toBeVisible();

    // Hero stat chips loaded from the season stats response
    await expect(dialog.getByText('AVG').first()).toBeVisible();
    await expect(dialog.getByText('HR').first()).toBeVisible();
    await expect(dialog.getByText('RBI').first()).toBeVisible();
  });

  test('normalises mixed-case brefId — /players/TroutMi01 resolves the same player', async ({
    page,
  }) => {
    await setupBrefIdMocks(page);
    // The page lowercases the param before querying; same mock applies
    await page.goto('/players/TroutMi01');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Mike Trout').first()).toBeVisible();
  });

  test('shows loading indicator while brefId lookup is in flight', async ({
    page,
  }) => {
    // Delay the brefId response so we can catch the loading state
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('getplayeridbybrefid')) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(BREF_ID_FOUND_RESPONSE),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/players/troutmi01');
    await page.waitForLoadState('domcontentloaded');

    // Loading indicator must be visible before brefId resolves
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('shows inline alert and no modal when brefId is not found', async ({
    page,
  }) => {
    await setupBrefIdMocks(page, {
      brefIdResponse: BREF_ID_NOT_FOUND_RESPONSE,
    });
    await page.goto('/players/unknownxx99');
    await page.waitForLoadState('networkidle');

    // The "No player found" alert must be visible
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('No player found');

    // Modal must NOT be mounted
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible();
  });

  test('back button on brefId route navigates to /players/stats', async ({
    page,
  }) => {
    await setupBrefIdMocks(page);
    await page.goto('/players/troutmi01');
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    const backButton = page.getByRole('button', { name: /← back/i });
    await expect(backButton).toBeVisible();
    await backButton.dispatchEvent('click');

    await page.waitForURL('**/players/stats');
  });
});
