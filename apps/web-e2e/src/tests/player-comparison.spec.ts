/**
 * Player Comparison Page E2E Tests (LS-676)
 *
 * Covers /players/compare:
 *   - Page structure (heading, search input, initial empty state)
 *   - Player search and add via mocked GraphQL
 *   - Side-by-side comparison table (requires 2+ players)
 *   - Remove player (X chip button)
 *   - Premium gate UX for non-premium users
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import {
  adminTest,
  customAuthTest,
  expect,
  test,
  unauthTest,
} from '../fixtures/pages';
import { extractOperationName, useTier } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYERS = [
  {
    __typename: 'Player',
    id: 1,
    firstName: 'Aaron',
    lastName: 'Judge',
    eligiblePositions: ['OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 850,
      avgPointsPerGame: 2.1,
      hitterScore: 80,
      pitchingScore: 0,
      fieldingScore: 5,
    },
    careerBatting: {
      games: 900,
      hits: 900,
      homeRuns: 220,
      rbi: 600,
      runs: 520,
      stolenBases: 10,
      baseOnBalls: 400,
      totalBases: 1800,
      offensiveWAR: 42.0,
    },
    averageSeasonBatting: {
      battingAverage: 0.282,
      onBasePercentage: 0.387,
      sluggingPercentage: 0.579,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 5,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 3,
      worldSeriesRings: 1,
    },
  },
  {
    __typename: 'Player',
    id: 2,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    eligiblePositions: ['SP', 'DH'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 960,
      avgPointsPerGame: 2.6,
      hitterScore: 75,
      pitchingScore: 60,
      fieldingScore: 3,
    },
    careerBatting: {
      games: 760,
      hits: 640,
      homeRuns: 175,
      rbi: 480,
      runs: 400,
      stolenBases: 50,
      baseOnBalls: 310,
      totalBases: 1400,
      offensiveWAR: 38.5,
    },
    averageSeasonBatting: {
      battingAverage: 0.274,
      onBasePercentage: 0.377,
      sluggingPercentage: 0.564,
    },
    careerPitching: {
      games: 130,
      wins: 55,
      losses: 23,
      saves: 0,
      strikeouts: 1200,
      baseOnBalls: 250,
      winPercentage: 0.705,
      era: '2.94',
    },
    careerAchievements: {
      allStarSelections: 4,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 2,
      worldSeriesRings: 0,
    },
  },
  {
    __typename: 'Player',
    id: 3,
    firstName: 'Mookie',
    lastName: 'Betts',
    eligiblePositions: ['OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 810,
      avgPointsPerGame: 1.95,
      hitterScore: 74,
      pitchingScore: 0,
      fieldingScore: 9,
    },
    careerBatting: {
      games: 1050,
      hits: 1150,
      homeRuns: 195,
      rbi: 580,
      runs: 700,
      stolenBases: 120,
      baseOnBalls: 520,
      totalBases: 1900,
      offensiveWAR: 54.0,
    },
    averageSeasonBatting: {
      battingAverage: 0.294,
      onBasePercentage: 0.371,
      sluggingPercentage: 0.511,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 6,
      mvpAwards: 1,
      cyYoungAwards: 0,
      goldGloves: 5,
      silverSluggers: 4,
      worldSeriesRings: 2,
    },
  },
];

/** Mock response for PlayersWithStats search query */
function makeMockPlayersResponse(players = MOCK_PLAYERS) {
  return {
    data: { players },
  };
}

/** Sets up GraphQL mocks for the Player Comparison page (premium user). */
async function mockPlayerComparisonGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const operation = extractOperationName(route).toLowerCase();

      if (operation === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockPlayersResponse()),
        });
      } else if (operation === 'getallplayerseasonstats') {
        // Season-by-season breakdown query fired after players are selected
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { playerSeasonStats: [] } }),
        });
      } else if (operation === 'getmysubscription') {
        // PremiumGate requires an active premium subscription
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              mySubscription: {
                __typename: 'SubscriptionInfo',
                status: 'active',
                tier: 'premium',
                currentPeriodEnd: '2026-12-31T00:00:00.000Z',
                cancelAtPeriodEnd: false,
                trialEndsAt: null,
                gracePeriodEndsAt: null,
              },
            },
          }),
        });
      } else {
        // Safe default: return empty data instead of hitting the real backend
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
  // Pin the current user to premium via the shared entitlement fixture
  // (LS-8058). Registered after the route above so its GetUserById handler runs
  // first (Playwright LIFO); this handler's else returns {data:{}} and would
  // otherwise leave the user non-premium.
  await useTier(page, 'premium');
}

// ---------------------------------------------------------------------------
// Tests: Page structure (basic load smoke — includes GetUserById mock)
// ---------------------------------------------------------------------------

test.describe('Player Comparison – page structure @smoke', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    // Mock GraphQL so useIsPremium doesn't hit a real backend
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
  });

  test('loads the player comparison page without errors', async ({
    page,
    playersPage,
  }) => {
    await expect(page).toHaveURL('/players/compare');
    await playersPage.expectNoApplicationError();
  });
});

test.describe('Player Comparison – page structure (premium) @smoke', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
  });

  test('shows Player Comparison heading', async ({ playersPage }) => {
    await playersPage.compare.expectHeadlineVisible();
  });

  test('shows search input for adding players', async ({ playersPage }) => {
    await playersPage.compare.expectSearchVisible();
  });

  test('shows placeholder text in search input', async ({ playersPage }) => {
    await playersPage.compare.expectSearchPlaceholderDefault();
  });

  test('shows player slot label', async ({ playersPage }) => {
    await playersPage.compare.expectSlotLabel();
  });

  test('shows minimum player hint when fewer than 2 selected', async ({
    playersPage,
  }) => {
    await playersPage.compare.expectMinimumPlayersHint();
  });
});

// ---------------------------------------------------------------------------
// Tests: Player search & add @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – player search @regression', () => {
  adminTest.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();
  });

  adminTest('search input accepts text input', async ({ playersPage }) => {
    await playersPage.compare.typeSearch('Aa');
  });

  adminTest(
    'search results appear when query is 2+ characters',
    async ({ playersPage }) => {
      await playersPage.compare.typeSearch('Aa');
      // Wait for the dropdown results from the mock
      await playersPage.compare.expectSuggestionVisible('Aaron Judge');
    },
  );

  adminTest(
    'search result shows player name and position',
    async ({ playersPage }) => {
      await playersPage.compare.typeSearch('Aa');
      await playersPage.compare.expectSuggestionVisible('Aaron Judge');
      await playersPage.compare.expectText('OF');
    },
  );

  adminTest(
    'selecting a player from results adds them as a chip',
    async ({ playersPage }) => {
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');

      // Player chip appears — verified by its Remove button
      await playersPage.compare.expectRemoveButton('Aaron Judge');
    },
  );

  adminTest(
    'adding a second player updates count to 2/4',
    async ({ playersPage }) => {
      await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');

      await playersPage.compare.expectCountHint(
        '2 of 4 selected · 2 slots open',
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Comparison table shown when 2+ players selected @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – comparison table @regression', () => {
  adminTest.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
    await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');
  });

  adminTest(
    'minimum player hint disappears once 2 players are selected',
    async ({ playersPage }) => {
      await playersPage.compare.expectMinimumPlayersHintHidden();
    },
  );

  adminTest('shows Fantasy Scoring section', async ({ playersPage }) => {
    await playersPage.compare.expectSectionVisible('Fantasy Scoring', {
      exact: true,
    });
  });

  adminTest('shows Career Batting section', async ({ playersPage }) => {
    await playersPage.compare.expectSectionVisible(/career batting/i);
  });

  adminTest('shows Career Achievements section', async ({ playersPage }) => {
    await playersPage.compare.expectSectionVisible(/career achievements/i);
  });

  adminTest(
    'shows player names in comparison header',
    async ({ playersPage }) => {
      await playersPage.compare.expectText('Aaron Judge');
      await playersPage.compare.expectText('Shohei Ohtani');
    },
  );

  adminTest('shows Avg Pts / Game stat row', async ({ playersPage }) => {
    await playersPage.compare.expectText('Avg Pts / Game');
  });
});

// ---------------------------------------------------------------------------
// Tests: Remove player @regression
// ---------------------------------------------------------------------------

adminTest.describe('Player Comparison – remove player @regression', () => {
  adminTest.beforeEach(async ({ page, playersPage }) => {
    await mockPlayerComparisonGraphQL(page);
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();

    // Add one player
    await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
  });

  adminTest('Remove button has correct aria-label', async ({ playersPage }) => {
    await playersPage.compare.expectRemoveButton('Aaron Judge');
  });

  adminTest(
    'clicking Remove button removes the player chip',
    async ({ playersPage }) => {
      await playersPage.compare.removePlayer('Aaron Judge');

      // Hint returns to the minimum-player prompt after chip removed
      await playersPage.compare.expectMinimumPlayersHint();
    },
  );

  adminTest(
    'removing a player shows an undo toast that restores the chip',
    async ({ playersPage }) => {
      // Sanity: chip present before removal.
      await playersPage.compare.expectChipVisible(1);

      await playersPage.compare.removePlayer('Aaron Judge');

      // Chip is gone, but a non-destructive undo toast appears (LS-7040).
      await playersPage.compare.expectChipCount(1, 0);
      await playersPage.compare.expectUndoToast('Aaron Judge');

      // Clicking Undo restores the removed player to its slot.
      await playersPage.compare.clickUndoRemove('Aaron Judge');

      await playersPage.compare.expectChipVisible(1);
      await playersPage.compare.expectUndoToastGone();
    },
  );

  adminTest(
    'minimum player hint reappears after removing second player',
    async ({ playersPage }) => {
      // Add a second player (retry fill+click — dropdown can detach during re-render)
      await playersPage.compare.addPlayer('Sh', 'Shohei Ohtani');

      // Now remove one
      await playersPage.compare.removePlayer('Aaron Judge');

      await playersPage.compare.expectMinimumPlayersHint();
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Premium gate for non-premium users @regression
// ---------------------------------------------------------------------------

// Use a custom auth fixture with accessLevel 'none' so useIsPremium doesn't
// short-circuit to true (the global-setup user may be an admin).
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

freeUserTest.describe('Player Comparison – premium gate @regression', () => {
  freeUserTest.beforeEach(async ({ page, playersPage }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const operation = extractOperationName(route).toLowerCase();
        if (operation === 'getmysubscription') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { mySubscription: null } }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: {} }),
          });
        }
      },
    );
    // Pin the current user to free via the shared entitlement fixture (LS-8058)
    // so the inline premium upgrade CTA renders. Registered after the route
    // above so its GetUserById handler runs first (Playwright LIFO).
    await useTier(page, 'free');
    await playersPage.gotoCompare();
  });

  freeUserTest(
    'shows inline premium upgrade CTA for non-premium users (LS-7012)',
    async ({ playersPage }) => {
      // PremiumGate overlay removed (LS-7012): free users now see the full page
      // with the inline PremiumBanner instead of a blur overlay. The banner
      // renders an "Upgrade" pill button that is always visible on the page.
      await playersPage.compare.expectPremiumUpgradeCta();
    },
  );

  freeUserTest(
    'shows Upgrade button in the inline premium banner (LS-7012)',
    async ({ playersPage }) => {
      // The page-level PremiumGate overlay is removed (LS-7012); the shared-
      // components PremiumBanner is the single "Upgrade" CTA, so no scoping
      // to a gate testid is needed — the button is unambiguous.
      await playersPage.compare.expectPremiumUpgradeCta();
    },
  );

  freeUserTest(
    'shows player comparison feature description',
    async ({ playersPage }) => {
      await playersPage.compare.expectText(/compare up to 4 players/i);
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Search threshold & slot selection @regression (LS-5574)
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – search threshold & slot selection @regression',
  () => {
    adminTest.beforeEach(async ({ page, playersPage }) => {
      await mockPlayerComparisonGraphQL(page);
      await playersPage.gotoCompare();
      await playersPage.compare.expectSearchVisible();
    });

    adminTest(
      'dropdown does not appear when query has fewer than 2 characters',
      async ({ playersPage }) => {
        await playersPage.compare.typeSearch('A');
        // With only 1 character, showDropdown is false (query.trim().length < 2)
        // — no results should be visible
        await playersPage.compare.expectSuggestionsHidden();
      },
    );

    adminTest(
      'search input is cleared after selecting a player from dropdown',
      async ({ playersPage }) => {
        await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
        await playersPage.compare.expectSearchValue('');
      },
    );

    adminTest(
      'empty slot indicators appear for unfilled slots when a player is added',
      async ({ playersPage }) => {
        await playersPage.compare.addPlayer('Aa', 'Aaron Judge');
        // After adding 1 player, 3 empty slot chips should appear for slots 2–4
        await playersPage.compare.expectEmptySlotText(2);
        await playersPage.compare.expectEmptySlotText(3);
        await playersPage.compare.expectEmptySlotText(4);
      },
    );

    adminTest(
      'empty slot chip is an actionable button that focuses the search input (PCM-046)',
      async ({ playersPage }) => {
        await playersPage.compare.addPlayer('Aa', 'Aaron Judge');

        // The empty slot chips are announced as actionable buttons rather than
        // static text — the dashed pill now matches its (real) clickability.
        await playersPage.compare.expectEmptySlotButton(2);

        // Activating it focuses the search input so the user can fill the slot.
        await playersPage.compare.clickEmptySlot(2);
        await playersPage.compare.expectSearchFocused();
      },
    );

    adminTest(
      'empty slot chip focuses the search input via the keyboard (PCM-046)',
      async ({ page, playersPage }) => {
        await playersPage.compare.addPlayer('Aa', 'Aaron Judge');

        await playersPage.compare.focusEmptySlot(2);
        await page.keyboard.press('Enter');
        await playersPage.compare.expectSearchFocused();
      },
    );

    adminTest(
      'selection succeeds when blur fires before click fires on the suggestion (PCM-030 regression)',
      async ({ playersPage }) => {
        await playersPage.compare.typeSearch('Aa');
        await playersPage.compare.expectSuggestionVisible('Aaron Judge');

        // Simulate the blur-before-click race that PCM-030 describes: blur the
        // input (as mousedown on the suggestion would) BEFORE clicking it.
        // Prior to the fix, onBlur called setOpen(false) and destroyed the
        // dropdown before the click could land. Now onBlur only calls
        // setFocused(false), so the dropdown must survive the blur.
        await playersPage.compare.blurSearch();
        await playersPage.compare.expectSuggestionVisible('Aaron Judge', 500);

        // Click the suggestion — must succeed even though input is already blurred.
        await playersPage.compare.clickSuggestion('Aaron Judge');
        await playersPage.compare.expectRemoveButton('Aaron Judge');
      },
    );

    adminTest(
      'already-selected player does not appear in dropdown on subsequent search',
      async ({ playersPage }) => {
        // Add Aaron Judge first
        await playersPage.compare.addPlayer('Aa', 'Aaron Judge');

        // Search again — mock returns all players but component filters out selected ones
        await playersPage.compare.expectSuggestionsVisibleAfterTyping('Aa');

        // Aaron Judge should not appear in the dropdown (he's already selected)
        await playersPage.compare.expectSuggestionHidden('Aaron Judge');
        // Other players (not selected) still appear
        await playersPage.compare.expectSuggestionVisible('Shohei Ohtani');
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests: Keyboard navigation @regression (LS-7022)
// ---------------------------------------------------------------------------

adminTest.describe(
  'Player Comparison – keyboard navigation @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockPlayerComparisonGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();
    });

    adminTest(
      'ArrowDown moves active descendant to first suggestion',
      async ({ playersPage }) => {
        await playersPage.compare.typeSearch('Aa');
        await playersPage.compare.expectSuggestionVisible('Aaron Judge');

        await playersPage.compare.pressSearchKey('ArrowDown');

        await playersPage.compare.expectSuggestionSelected('Aaron Judge');
      },
    );

    adminTest(
      'ArrowDown then ArrowUp restores no selection',
      async ({ playersPage }) => {
        await playersPage.compare.typeSearch('Aa');
        await playersPage.compare.expectSuggestionVisible('Aaron Judge');

        await playersPage.compare.pressSearchKey('ArrowDown');
        await playersPage.compare.pressSearchKey('ArrowUp');

        await playersPage.compare.expectSuggestionDeselected('Aaron Judge');
      },
    );

    adminTest(
      'Enter selects the focused suggestion and clears input',
      async ({ playersPage }) => {
        await playersPage.compare.typeSearch('Aa');
        await playersPage.compare.expectSuggestionVisible('Aaron Judge');

        await playersPage.compare.pressSearchKey('ArrowDown');
        await playersPage.compare.pressSearchKey('Enter');

        await playersPage.compare.expectRemoveButton('Aaron Judge');
        await playersPage.compare.expectSearchValue('');
      },
    );

    adminTest('Escape closes the suggestion list', async ({ page }) => {
      const input = page.getByLabel('Search players to compare');
      await input.fill('Aa');
      await expect(page.getByLabel('Player suggestions')).toBeVisible();

      await input.press('Escape');

      await expect(page.getByLabel('Player suggestions')).not.toBeVisible({
        timeout: 2000,
      });
    });
  },
);

// ---------------------------------------------------------------------------
// Tests: Unauthenticated visitor – Get Started Free CTA @regression
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Player Comparison – unauthenticated visitor @regression',
  () => {
    unauthTest.beforeEach(async ({ playersPage }) => {
      await playersPage.gotoCompare();
    });

    unauthTest(
      'does not show the player comparison tool when not authenticated',
      async ({ playersPage }) => {
        await playersPage.compare.expectHeadlineHidden();
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible and navigates to / on /players/compare for unauthenticated users',
      async ({ page, playersPage }) => {
        await playersPage.compare.expectGetStartedFree();
        await playersPage.compare.clickGetStartedFree();
        await expect(page).toHaveURL('/');
      },
    );
  },
);
