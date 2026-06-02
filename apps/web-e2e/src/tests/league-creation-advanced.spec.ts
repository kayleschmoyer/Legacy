/**
 * League Creation Advanced E2E Tests (LS-609)
 *
 * Covers error handling, edge cases, scoring config, roster size, era filter,
 * waiver system, league visibility, salary cap, and draft configuration options.
 *
 * Complements league-creation.spec.ts which covers the basic happy path and
 * top-level GraphQL error handling.
 */

import {
  adminTest,
  createCustomAuthTest,
  expect,
  test,
} from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');

/** URL predicate that matches GraphQL API endpoints but not source file imports */

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

/** Expand a collapsible section by clicking its toggle header */
async function expandSection(
  page: import('@playwright/test').Page,
  sectionId: string,
) {
  const toggle = page.getByTestId(`section-toggle-${sectionId}`);
  await expect(toggle).toBeVisible();
  // Only expand if the section is currently collapsed
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

test.describe('League Creation — Advanced Settings @regression', () => {
  // ─── Roster Size ──────────────────────────────────────────────────────────

  test('should display all roster size options with correct default', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Roster & Schedule section
    await expandSection(page, 'roster-schedule');

    // All preset roster sizes should be visible
    for (const size of ['20', '22', '24', '26', '28', '30', '35', '40']) {
      await expect(
        page.getByRole('button', { name: size, exact: true }),
      ).toBeVisible();
    }

    // Hint text is visible
    await expect(page.getByText('Active + bench.')).toBeVisible();
  });

  test('should select a roster size when clicked', async ({ page }) => {
    await mockCreateLeagueSuccess(page);
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Roster & Schedule section
    await expandSection(page, 'roster-schedule');

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

    // Expand the Roster & Schedule section
    await expandSection(page, 'roster-schedule');

    await expect(page.getByRole('button', { name: 'All MLB' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'National League' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'American League' }),
    ).toBeVisible();

    await expect(
      page.getByText("Narrow the league to a single league's talent"),
    ).toBeVisible();
  });

  test('should allow selecting National League player pool', async ({
    page,
  }) => {
    await mockCreateLeagueSuccess(page);
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Roster & Schedule section
    await expandSection(page, 'roster-schedule');

    await page.getByRole('button', { name: 'National League' }).click();
    await page.getByPlaceholder('Enter your league name').fill('NL League');
    await page.getByRole('button', { name: /create league/i }).click();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Scheduling Strategy ──────────────────────────────────────────────────

  test('should display all scheduling strategy options', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Roster & Schedule section
    await expandSection(page, 'roster-schedule');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

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

    // Expand the Draft Settings section
    await expandSection(page, 'draft');

    await expect(
      page.getByRole('button', { name: 'Snake', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Linear', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Snake order reverses each round'),
    ).toBeVisible();
  });

  // ─── Waiver System ────────────────────────────────────────────────────────

  test('should display Standard and FAAB waiver options', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Waivers, Budget & Salary Cap section
    await expandSection(page, 'waiver-budget');

    await expect(page.getByText('Waiver System')).toBeVisible();
    await expect(page.getByText('Teams have a priority order')).toBeVisible();
  });

  freeUserTest(
    'should show upgrade modal when free user clicks FAAB waiver option',
    async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Expand the Waivers, Budget & Salary Cap section
      await expandSection(page, 'waiver-budget');

      // Click the FAAB waiver option — for a free user this triggers the
      // upgrade gate (PremiumGate wraps the option and intercepts the click).
      const faabButton = page.getByRole('button', { name: /FAAB/i }).first();
      await expect(faabButton).toBeVisible({ timeout: 10000 });
      await faabButton.click();

      // Free user should see the premium gate overlay.
      await expect(page.getByTestId('premium-feature-gate')).toBeVisible({
        timeout: 10000,
      });
    },
  );

  // ─── Hall of Fame Only ────────────────────────────────────────────────────

  test('should toggle Hall of Fame Only mode text', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Era & History section
    await expandSection(page, 'era-history');

    // Default state
    await expect(page.getByText('🏆 Off')).toBeVisible();
    await expect(page.getByText('Hall of Fame Draft Mode')).toBeVisible();

    // Toggle ON
    await page.getByText('🏆 Off').click();
    await expect(page.getByText('🏆 On')).toBeVisible();

    // Toggle OFF again
    await page.getByText('🏆 On').click();
    await expect(page.getByText('🏆 Off')).toBeVisible();
  });

  // ─── Era Filter ───────────────────────────────────────────────────────────

  test('should display Historical Era Filter section', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Era & History section
    await expandSection(page, 'era-history');

    await expect(page.getByText('Historical Era Filter')).toBeVisible();
    // EraFilterGrid (LS-5174) renders each era as a Tamagui card whose
    // accessible name is the era name only (`aria-label={era.name}`); the year
    // range is separate muted text. Match the option by its accessible name and
    // assert the year range via its own text node.
    await expect(page.getByRole('button', { name: 'All Eras' })).toBeVisible();
    await expect(page.getByText(/1871\s*[–-]\s*Now/)).toBeVisible();
    await expect(page.getByText('Dead Ball (pre-1920)')).toBeVisible();
    await expect(page.getByText('Modern (2006+)')).toBeVisible();
  });

  test('should show custom era year inputs when Custom Era is selected', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Expand the Era & History section
    await expandSection(page, 'era-history');

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

    // Expand the Era & History section
    await expandSection(page, 'era-history');

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

    // Expand the Waivers, Budget & Salary Cap section
    await expandSection(page, 'waiver-budget');

    await expect(page.getByText('Enable Salary Cap')).toBeVisible();
    await expect(
      page.getByText(
        'Track player salaries and enforce roster spending limits',
      ),
    ).toBeVisible();
  });

  adminTest(
    'should show salary cap limit input when Enable Salary Cap is toggled',
    async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('networkidle');

      // Expand the Waivers, Budget & Salary Cap section
      await expandSection(page, 'waiver-budget');

      // Cap limit input should not be visible initially
      await expect(page.getByPlaceholder('e.g. 50000000')).not.toBeVisible();

      // Click the "On" button in the Enable Salary Cap PillToggle
      await page.getByRole('button', { name: 'On', exact: true }).click();

      // Cap limit input should now be visible
      await expect(page.getByPlaceholder('e.g. 50000000')).toBeVisible();
      await expect(page.getByText('Salary Cap Limit')).toBeVisible();
      await expect(
        page.getByText('Maximum total salary each team can spend'),
      ).toBeVisible();
    },
  );

  // ─── Form Validation (inline error card) ──────────────────────────────────

  test('submit button is enabled even with a short league name', async ({
    page,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter your league name').fill('Ab');
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeEnabled();

    // Clicking shows a validation error without crashing the page
    await createButton.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
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

  test('submit button is always enabled regardless of league name length', async ({
    page,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Short name — button is still enabled (validation fires on submit)
    await page.getByPlaceholder('Enter your league name').fill('Ab');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeEnabled();

    // Valid name — button remains enabled
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
        await unmockedGraphQLFallback(route);
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
    await page.route('**/graphql**', async (route) =>
      unmockedGraphQLFallback(route),
    );
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
      page.getByText("Your league is created and you're set as Commissioner"),
    ).toBeVisible();
    await expect(page.getByText('Send invite links')).toBeVisible();
    await expect(page.getByText('Draft opens')).toBeVisible();
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
        await unmockedGraphQLFallback(route);
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
