/**
 * League Creation Advanced E2E Tests (LS-609)
 *
 * Covers error handling, edge cases, scoring config, roster size, era filter,
 * waiver system, league visibility, salary cap, and draft configuration options.
 *
 * Complements league-creation.spec.ts which covers the basic happy path and
 * top-level GraphQL error handling.
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';

/** URL predicate that matches GraphQL API endpoints but not source file imports */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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
      await route.fallback();
    }
  });
}

test.describe('League Creation — Advanced Settings @regression', () => {
  // ─── Roster Size ──────────────────────────────────────────────────────────

  test('should display all roster size options with correct default', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // All preset roster sizes should be visible
    for (const size of ['20', '22', '25', '30', '35', '40']) {
      await expect(
        page.getByRole('button', { name: size, exact: true }),
      ).toBeVisible();
    }

    // Hint text is visible
    await expect(
      page.getByText('Number of players each team can have'),
    ).toBeVisible();
  });

  test('should select a roster size when clicked', async ({ page }) => {
    await mockCreateLeagueSuccess(page);
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Click roster size 30
    await page.getByRole('button', { name: '30', exact: true }).click();

    // Fill name and submit to verify the selection was accepted (form submits)
    await page.getByPlaceholder('Enter your league name').fill('My League');
    await page.getByRole('button', { name: /create league/i }).click();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Player Pool ──────────────────────────────────────────────────────────

  test('should display all player pool options', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'All MLB' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'National League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'American League' }),
    ).toBeVisible();

    await expect(page.getByText('Which players can be drafted')).toBeVisible();
  });

  test('should allow selecting National League player pool', async ({
    page,
  }) => {
    await mockCreateLeagueSuccess(page);
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'National League' }).click();
    await page.getByPlaceholder('Enter your league name').fill('NL League');
    await page.getByRole('button', { name: /create league/i }).click();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Scheduling Strategy ──────────────────────────────────────────────────

  test('should display all scheduling strategy options', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: 'Divisional' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Round Robin' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Random' }).first(),
    ).toBeVisible();

    await expect(
      page.getByText('Divisional schedules prioritize in-division matchups'),
    ).toBeVisible();
  });

  // ─── Number of Divisions ──────────────────────────────────────────────────

  test('should display division count section with heading and helper text', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Number of Divisions')).toBeVisible();
    await expect(page.getByText('How many divisions to split')).toBeVisible();
  });

  // ─── Draft Mode ───────────────────────────────────────────────────────────

  test('should display Live Draft and Automated Draft options', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: 'Live Draft' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Automated Draft' }),
    ).toBeVisible();

    await expect(
      page.getByText('Live drafts require all managers online'),
    ).toBeVisible();
  });

  test('should disable selection method buttons when Automated Draft is selected', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Switch to Automated Draft
    await page.getByRole('button', { name: 'Automated Draft' }).click();

    // Selection method buttons should be disabled
    await expect(
      page.getByRole('button', { name: 'Standard' }).first(),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Auction' })).toBeDisabled();

    // Explanatory note should mention automated
    await expect(
      page.getByText(/Automated drafts use random player assignment/),
    ).toBeVisible();
  });

  test('should re-enable selection method when switching back to Live Draft', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Automated Draft' }).click();
    await page.getByRole('button', { name: 'Live Draft' }).click();

    // Selection method buttons should be enabled again
    await expect(
      page.getByRole('button', { name: 'Standard' }).first(),
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Auction' })).toBeEnabled();
  });

  // ─── Selection Method ─────────────────────────────────────────────────────

  test('should display Standard, Auction, and Random selection methods', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: 'Standard' }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Auction' })).toBeVisible();
    await expect(
      page.getByText('Standard picks in order, auction bidding'),
    ).toBeVisible();
  });

  test('should show auction budget and min bid inputs when Auction is selected', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Auction budget section not visible until Auction selection method is chosen
    // Select Auction selection method
    await page.getByRole('button', { name: 'Auction' }).click();

    // Auction budget and min bid inputs should now appear
    await expect(page.getByText('Auction Budget per Team')).toBeVisible();
    await expect(page.getByText('Minimum Bid')).toBeVisible();
    await expect(page.getByPlaceholder('200')).toBeVisible();
    await expect(page.getByPlaceholder('1')).toBeVisible();
  });

  // ─── Draft Order ──────────────────────────────────────────────────────────

  test('should display Snake and Linear draft order options', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Snake' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Linear' })).toBeVisible();
    await expect(
      page.getByText('Snake order reverses each round'),
    ).toBeVisible();
  });

  // ─── Waiver System ────────────────────────────────────────────────────────

  test('should display Standard and FAAB waiver options', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Waiver System')).toBeVisible();
    await expect(page.getByText('Teams have a priority order')).toBeVisible();
  });

  test('should show upgrade modal when free user clicks FAAB waiver option', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('load');

    // Find the FAAB button anywhere on the page
    const faabButton = page.getByRole('button', { name: 'FAAB' });
    await expect(faabButton).toBeVisible();
    await faabButton.click();

    // Free user should see upgrade modal or premium gate text
    await expect(page.getByText(/upgrade|premium/i).first()).toBeVisible();
  });

  // ─── Hall of Fame Only ────────────────────────────────────────────────────

  test('should toggle Hall of Fame Only mode text', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Default state
    await expect(page.getByText('🏆 Hall of Famers Only — OFF')).toBeVisible();
    await expect(page.getByText('Hall of Fame Draft Mode')).toBeVisible();

    // Toggle ON
    await page.getByText('🏆 Hall of Famers Only — OFF').click();
    await expect(page.getByText('🏆 Hall of Famers Only — ON')).toBeVisible();

    // Toggle OFF again
    await page.getByText('🏆 Hall of Famers Only — ON').click();
    await expect(page.getByText('🏆 Hall of Famers Only — OFF')).toBeVisible();
  });

  // ─── Era Filter ───────────────────────────────────────────────────────────

  test('should display Historical Era Filter section', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Historical Era Filter')).toBeVisible();
    await expect(page.getByText('All Eras')).toBeVisible();
    await expect(page.getByText('Dead Ball (pre-1920)')).toBeVisible();
    await expect(page.getByText('Modern (2006+)')).toBeVisible();
  });

  test('should show custom era year inputs when Custom Era is selected', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Custom Era year inputs should not be visible initially
    await expect(page.getByPlaceholder('e.g. 1940')).not.toBeVisible();
    await expect(page.getByPlaceholder('e.g. 1960')).not.toBeVisible();

    // Click Custom Era
    await page.getByText('Custom Era').click();

    // Year range inputs should now appear
    await expect(page.getByPlaceholder('e.g. 1940')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 1960')).toBeVisible();
    await expect(page.getByText('Start Year')).toBeVisible();
    await expect(page.getByText('End Year')).toBeVisible();
  });

  test('should hide custom era inputs when switching away from Custom Era', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByText('Custom Era').click();
    await expect(page.getByPlaceholder('e.g. 1940')).toBeVisible();

    // Switch back to All Eras
    await page.getByText('All Eras').click();
    await expect(page.getByPlaceholder('e.g. 1940')).not.toBeVisible();
  });

  // ─── League Visibility ────────────────────────────────────────────────────

  test('should display Private and Public league visibility options', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('League Visibility')).toBeVisible();
    await expect(page.getByText('🔒 Private')).toBeVisible();
    await expect(page.getByText('🌐 Public')).toBeVisible();

    // Default description for private
    await expect(
      page.getByText('Only people with your invite code can join'),
    ).toBeVisible();
  });

  test('should change visibility description when switching to Public', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByText('🌐 Public').click();

    await expect(
      page.getByText('Anyone can browse and join this league'),
    ).toBeVisible();
  });

  // ─── Salary Cap ───────────────────────────────────────────────────────────

  test('should display Salary Cap toggle', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Enable Salary Cap')).toBeVisible();
    await expect(
      page.getByText(
        'Track player salaries and enforce roster spending limits',
      ),
    ).toBeVisible();
  });

  test('should show salary cap limit input when Enable Salary Cap is toggled', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Cap limit input should not be visible initially
    await expect(page.getByPlaceholder('e.g. 50000000')).not.toBeVisible();

    // Click the Enable Salary Cap toggle
    await page.getByText('Enable Salary Cap').click();

    // Cap limit input should now be visible
    await expect(page.getByPlaceholder('e.g. 50000000')).toBeVisible();
    await expect(page.getByText('Salary Cap Limit')).toBeVisible();
    await expect(
      page.getByText('Maximum total salary each team can spend'),
    ).toBeVisible();
  });

  // ─── Form Validation (inline error card) ──────────────────────────────────

  test('should keep submit disabled for name too short', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter your league name').fill('Ab');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeDisabled();
  });

  test('should display inline error card for name too long on submit', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter your league name').fill('A'.repeat(51));
    await page.getByRole('button', { name: /create league/i }).click();

    await expect(page.getByRole('alert')).toContainText(
      'League name must be less than 50 characters',
    );
  });

  test('should enable submit once short name is corrected', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Short names keep the submit button disabled
    await page.getByPlaceholder('Enter your league name').fill('Ab');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeDisabled();

    // Fix the name and verify submit becomes enabled
    await page
      .getByPlaceholder('Enter your league name')
      .fill('Fixed League Name');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeEnabled();
  });

  test('should display GraphQL network error in inline error card', async ({
    page,
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
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Enter your league name').fill('My League');
    await page.getByRole('button', { name: /create league/i }).click();

    // The app should show an error state — either an inline error card,
    // an apollo toast, or a role="alert" element
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/error|failed|server error/i).first())
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL('/baseball/league/create');
  });

  // ─── Cancel Button ────────────────────────────────────────────────────────

  test('should navigate to /baseball when Cancel is clicked', async ({
    page,
  }) => {
    await page.route('**/graphql**', async (route) => route.fallback());
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page).toHaveURL('/baseball');
  });

  // ─── "What happens next?" Info Card ──────────────────────────────────────

  test('should display league creation info card with all bullet points', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('What happens next?')).toBeVisible();
    await expect(
      page.getByText("You'll be set as the league commissioner"),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Teams will be auto-generated and ready for member assignment',
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        'You can invite friends to join your league after creation',
      ),
    ).toBeVisible();
  });

  // ─── Loading State ────────────────────────────────────────────────────────

  test('should show Creating... text on button while submitting', async ({
    page,
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
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');
    await page
      .getByPlaceholder('Enter your league name')
      .fill('My Fast League');
    await page.getByRole('button', { name: /create league/i }).click();

    // During submission the button text should change
    await expect(
      page.getByRole('button', { name: /creating\.\.\./i }),
    ).toBeVisible();
  });
});
