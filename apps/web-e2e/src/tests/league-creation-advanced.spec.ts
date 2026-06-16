/**
 * League Creation Advanced E2E Tests (LS-609)
 *
 * Covers error handling, edge cases, scoring config, roster size, era filter,
 * waiver system, league visibility, salary cap, and draft configuration options.
 *
 * Complements league-creation.spec.ts which covers the basic happy path and
 * top-level GraphQL error handling.
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — specs are selector-free. Identity stays a fixture concern
 * (admin / free / default), composed via `withPageObjects`.
 */

import { adminTest, customAuthTest, expect, test } from '../fixtures/pages';
import { unmockedGraphQLFallback, useTier } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Free-tier identity, with page objects injected. */
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

/** Mock a successful createLeagueAndTeams response */
async function mockCreateLeagueSuccess(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';
    if (postData.includes('createleagueandteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: {
                __typename: 'League',
                id: 42,
                name: 'Test League',
                owner: 1,
                maxRosterSize: 25,
                currentMatchup: null,
                draftStatus: 'not-started',
                numberOfTeams: 12,
                playerPool: 'all',
                draftMode: 'live',
                selectionMethod: 'standard',
                draftOrder: 'snake',
                isPublic: false,
              },
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('League Creation — Advanced Settings @regression', () => {
  // ─── Roster Size ──────────────────────────────────────────────────────────

  test('should display all roster size options with correct default', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    // All preset roster sizes should be visible
    for (const size of ['20', '22', '24', '26', '28', '30', '35', '40']) {
      await expect(leaguePage.button(size, { exact: true })).toBeVisible();
    }

    // Hint text is visible
    await expect(leaguePage.text('Active + bench.')).toBeVisible();
  });

  test('should select a roster size when clicked', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateLeagueSuccess(page);
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    // Click roster size 30
    await leaguePage.clickButton('30', { exact: true });

    // Fill name and submit to verify the selection was accepted (form submits)
    await leaguePage.fillLeagueName('My League');
    await leaguePage.submitCreate();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Player Pool ──────────────────────────────────────────────────────────

  test('should display all player pool options', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await expect(leaguePage.button('All MLB')).toBeVisible();
    await expect(leaguePage.button('National League')).toBeVisible();
    await expect(leaguePage.button('American League')).toBeVisible();

    await expect(
      leaguePage.text("Narrow the league to a single league's talent"),
    ).toBeVisible();
  });

  test('should allow selecting National League player pool', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateLeagueSuccess(page);
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await leaguePage.clickButton('National League');
    await leaguePage.fillLeagueName('NL League');
    await leaguePage.submitCreate();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Scheduling Strategy ──────────────────────────────────────────────────

  test('should display all scheduling strategy options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await expect(leaguePage.button('Divisional')).toBeVisible();
    await expect(leaguePage.button('Round Robin')).toBeVisible();
    await expect(leaguePage.button('Random').first()).toBeVisible();

    await expect(
      leaguePage.text('Divisional schedules prioritize in-division matchups'),
    ).toBeVisible();
  });

  // ─── Number of Divisions ──────────────────────────────────────────────────

  test('should display division count section with heading and helper text', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await expect(leaguePage.text('Number of Divisions')).toBeVisible();
    await expect(leaguePage.text('How many divisions to split')).toBeVisible();
  });

  // ─── Draft Mode ───────────────────────────────────────────────────────────

  test('should display Live Draft and Automated Draft options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await expect(leaguePage.button('Live Draft')).toBeVisible();
    await expect(leaguePage.button('Automated Draft')).toBeVisible();

    await expect(
      leaguePage.text('Live drafts require all managers online'),
    ).toBeVisible();
  });

  test('should disable selection method buttons when Automated Draft is selected', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    // Switch to Automated Draft
    await leaguePage.clickButton('Automated Draft');

    // Selection method buttons should be disabled
    await expect(leaguePage.button('Standard').first()).toBeDisabled();
    await expect(leaguePage.button('Auction')).toBeDisabled();

    // Explanatory note should mention automated
    await expect(
      leaguePage.text(/Automated drafts use random player assignment/),
    ).toBeVisible();
  });

  test('should re-enable selection method when switching back to Live Draft', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await leaguePage.clickButton('Automated Draft');
    await leaguePage.clickButton('Live Draft');

    // Selection method buttons should be enabled again
    await expect(leaguePage.button('Standard').first()).toBeEnabled();
    await expect(leaguePage.button('Auction')).toBeEnabled();
  });

  // ─── Selection Method ─────────────────────────────────────────────────────

  test('should display Standard, Auction, and Random selection methods', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await expect(leaguePage.button('Standard').first()).toBeVisible();
    await expect(leaguePage.button('Auction')).toBeVisible();
    await expect(
      leaguePage.text('Standard picks in order, auction bidding'),
    ).toBeVisible();
  });

  test('should show auction budget and min bid inputs when Auction is selected', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    // Auction budget section not visible until Auction selection method is chosen
    // Select Auction selection method
    await leaguePage.clickButton('Auction');

    // Auction budget and min bid inputs should now appear
    await expect(leaguePage.text('Auction Budget per Team')).toBeVisible();
    await expect(leaguePage.text('Minimum Bid')).toBeVisible();
    await expect(leaguePage.placeholder('200')).toBeVisible();
    await expect(leaguePage.placeholder('1')).toBeVisible();
  });

  // ─── Draft Order ──────────────────────────────────────────────────────────

  test('should display Snake and Linear draft order options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await expect(leaguePage.button('Snake', { exact: true })).toBeVisible();
    await expect(leaguePage.button('Linear', { exact: true })).toBeVisible();
    await expect(
      leaguePage.text('Snake order reverses each round'),
    ).toBeVisible();
  });

  // ─── Waiver System ────────────────────────────────────────────────────────

  test('should display Standard and FAAB waiver options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Waivers, Budget & Salary Cap section
    await leaguePage.expandSection('waiver-budget');

    await expect(leaguePage.text('Waiver System')).toBeVisible();
    await expect(leaguePage.text('Teams have a priority order')).toBeVisible();
  });

  freeUserTest(
    'should show upgrade modal when free user clicks FAAB waiver option',
    async ({ page, leaguePage }) => {
      // Premium status is sourced from GetUserById, whose baseline mock now
      // returns a premium user (LS-5030 / #5236). Pin this user back to free so
      // the FAAB PremiumGate actually fires for this gate-verification test.
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await expect(leaguePage.leagueNameInput).toBeVisible();

      // Expand the Waivers, Budget & Salary Cap section
      await leaguePage.expandSection('waiver-budget');

      // Click the FAAB waiver option — for a free user this triggers the
      // upgrade gate (PremiumGate wraps the option and intercepts the click).
      const faabButton = leaguePage.button(/FAAB/i).first();
      await expect(faabButton).toBeVisible({ timeout: 10000 });
      await faabButton.click();

      // Free user should see the premium gate overlay.
      await expect(leaguePage.premiumGate).toBeVisible({ timeout: 10000 });
    },
  );

  // ─── Hall of Fame Only ────────────────────────────────────────────────────

  test('should toggle Hall of Fame Only mode text', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    // Default state
    await expect(leaguePage.text('🏆 Off')).toBeVisible();
    await expect(leaguePage.text('Hall of Fame Draft Mode')).toBeVisible();

    // Toggle ON
    await leaguePage.clickText('🏆 Off');
    await expect(leaguePage.text('🏆 On')).toBeVisible();

    // Toggle OFF again
    await leaguePage.clickText('🏆 On');
    await expect(leaguePage.text('🏆 Off')).toBeVisible();
  });

  // ─── Era Filter ───────────────────────────────────────────────────────────

  test('should display Historical Era Filter section', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    await expect(leaguePage.text('Historical Era Filter')).toBeVisible();
    // EraFilterGrid (LS-5174) renders each era as a Tamagui card whose
    // accessible name is the era name only (`aria-label={era.name}`); the year
    // range is separate muted text. Match the option by its accessible name and
    // assert the year range via its own text node.
    await expect(leaguePage.button('All Eras')).toBeVisible();
    await expect(leaguePage.text(/1871\s*[–-]\s*Now/)).toBeVisible();
    await expect(leaguePage.text('Dead Ball (pre-1920)')).toBeVisible();
    await expect(leaguePage.text('Modern (2006+)')).toBeVisible();
  });

  test('should show custom era year inputs when Custom Era is selected', async ({
    page,
    leaguePage,
  }) => {
    // Custom Era is a premium-gated control — establish premium before nav.
    await useTier(page, 'premium');
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    // Custom Era year inputs should not be visible initially
    await expect(leaguePage.placeholder('e.g. 1940')).not.toBeVisible();
    await expect(leaguePage.placeholder('e.g. 1960')).not.toBeVisible();

    // Click Custom Era
    await leaguePage.clickText('Custom Era');

    // Year range inputs should now appear
    await expect(leaguePage.placeholder('e.g. 1940')).toBeVisible();
    await expect(leaguePage.placeholder('e.g. 1960')).toBeVisible();
    await expect(leaguePage.text('Start Year')).toBeVisible();
    await expect(leaguePage.text('End Year')).toBeVisible();
  });

  test('should hide custom era inputs when switching away from Custom Era', async ({
    page,
    leaguePage,
  }) => {
    // Custom Era is a premium-gated control — establish premium before nav.
    await useTier(page, 'premium');
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    await leaguePage.clickText('Custom Era');
    await expect(leaguePage.placeholder('e.g. 1940')).toBeVisible();

    // Switch back to All Eras
    await leaguePage.clickText('All Eras');
    await expect(leaguePage.placeholder('e.g. 1940')).not.toBeVisible();
  });

  // ─── League Visibility ────────────────────────────────────────────────────

  test('should display Private and Public league visibility options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await expect(leaguePage.text('League Visibility')).toBeVisible();
    await expect(leaguePage.text('🔒 Private')).toBeVisible();
    await expect(leaguePage.text('🌐 Public')).toBeVisible();

    // Default description for private
    await expect(
      leaguePage.text('Only people with your invite code can join'),
    ).toBeVisible();
  });

  test('should change visibility description when switching to Public', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await leaguePage.clickText('🌐 Public');

    await expect(
      leaguePage.text('Anyone can browse and join this league'),
    ).toBeVisible();
  });

  // ─── Salary Cap ───────────────────────────────────────────────────────────

  test('should display Salary Cap toggle', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Expand the Waivers, Budget & Salary Cap section
    await leaguePage.expandSection('waiver-budget');

    await expect(leaguePage.text('Enable Salary Cap')).toBeVisible();
    await expect(
      leaguePage.text(
        'Track player salaries and enforce roster spending limits',
      ),
    ).toBeVisible();
  });

  adminTest(
    'should show salary cap limit input when Enable Salary Cap is toggled',
    async ({ page, leaguePage }) => {
      // Salary Cap is wrapped in a PremiumGate — establish premium before nav
      // so the gate overlay does not intercept the toggle click.
      await useTier(page, 'premium');
      await leaguePage.gotoCreate();
      await expect(leaguePage.leagueNameInput).toBeVisible();

      // Expand the Waivers, Budget & Salary Cap section
      await leaguePage.expandSection('waiver-budget');

      // Cap limit input should not be visible initially
      await expect(leaguePage.placeholder('e.g. 50000000')).not.toBeVisible();

      // Click the "On" button in the Enable Salary Cap PillToggle
      await leaguePage.clickButton('On', { exact: true });

      // Cap limit input should now be visible
      await expect(leaguePage.placeholder('e.g. 50000000')).toBeVisible();
      await expect(leaguePage.text('Salary Cap Limit')).toBeVisible();
      await expect(
        leaguePage.text('Maximum total salary each team can spend'),
      ).toBeVisible();
    },
  );

  // ─── Form Validation (inline error card) ──────────────────────────────────

  test('submit button is enabled even with a short league name', async ({
    leaguePage,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await leaguePage.fillLeagueName('Ab');
    await expect(leaguePage.createButton).toBeEnabled();

    // Clicking shows a validation error without crashing the page
    await leaguePage.submitCreate();
    await expect(leaguePage.alert).toBeVisible();
    await leaguePage.expectNoAppError();
  });

  test('should display inline error card for name too long on submit', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await leaguePage.fillLeagueName('A'.repeat(51));
    await leaguePage.submitCreate();

    await expect(leaguePage.alert).toContainText(
      'League name must be less than 50 characters',
    );
  });

  test('submit button is always enabled regardless of league name length', async ({
    leaguePage,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    // Short name — button is still enabled (validation fires on submit)
    await leaguePage.fillLeagueName('Ab');
    await expect(leaguePage.createButton).toBeEnabled();

    // Valid name — button remains enabled
    await leaguePage.fillLeagueName('Fixed League Name');
    await expect(leaguePage.createButton).toBeEnabled();
  });

  test('should display GraphQL network error in inline error card', async ({
    page,
    leaguePage,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('createleagueandteams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message: 'Internal server error',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();
    await leaguePage.fillLeagueName('My League');
    await leaguePage.submitCreate();

    // The app should show an error state — either an inline error card,
    // an apollo toast, or a role="alert" element
    await expect(
      leaguePage.alert
        .or(leaguePage.text(/error|failed|server error/i).first())
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL('/baseball/league/create');
  });

  // ─── Cancel Button ────────────────────────────────────────────────────────

  test('should navigate to /baseball when Cancel is clicked', async ({
    page,
    leaguePage,
  }) => {
    await page.route('**/graphql**', async (route) =>
      unmockedGraphQLFallback(route),
    );
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await leaguePage.button(/^cancel$/i).click();
    await expect(page).toHaveURL('/baseball');
  });

  // ─── "What happens next?" Info Card ──────────────────────────────────────

  test('should display league creation info card with all bullet points', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();

    await expect(leaguePage.text('What happens next?')).toBeVisible();
    await expect(
      leaguePage.text("Your league is created and you're set as Commissioner"),
    ).toBeVisible();
    await expect(leaguePage.text('Send invite links')).toBeVisible();
    await expect(leaguePage.text('Draft opens')).toBeVisible();
  });

  // ─── Loading State ────────────────────────────────────────────────────────

  test('should show Creating... text on button while submitting', async ({
    page,
    leaguePage,
  }) => {
    // Delay the response so we can catch the loading state
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('createleagueandteams')) {
        await new Promise((r) => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: {
                  __typename: 'League',
                  id: 1,
                  name: 'Test',
                  owner: 1,
                  maxRosterSize: 25,
                  currentMatchup: null,
                  draftStatus: 'not-started',
                  numberOfTeams: 12,
                  playerPool: 'all',
                  draftMode: 'live',
                  selectionMethod: 'standard',
                  draftOrder: 'snake',
                  isPublic: false,
                },
              },
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await expect(leaguePage.leagueNameInput).toBeVisible();
    await leaguePage.fillLeagueName('My Fast League');
    await leaguePage.submitCreate();

    // During submission the button text should change
    await expect(leaguePage.creatingButton).toBeVisible();
  });
});
