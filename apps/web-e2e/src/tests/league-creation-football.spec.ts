/**
 * League Creation — Sport-aware E2E Tests (LS-4631)
 *
 * Verifies the Create League page reacts to the active sport — URL-driven
 * (`/baseball/league/create` vs `/football/league/create`), SportSwitcher
 * navigates between the two, and submission persists `sport` in the
 * CreateLeagueAndTeams GraphQL mutation.
 *
 * Hermetic — all GraphQL is mocked via page.route. Supersedes the LS-4635
 * "coming soon" tests now that the SportSwitcher is fully wired.
 *
 * Complements:
 *  - league-creation.spec.ts (baseball happy path)
 *  - league-creation-advanced.spec.ts (advanced settings + baseline FAAB gate)
 */

import { test } from '../fixtures/auth';
import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');

/** Expand a collapsible section by clicking its toggle header. */
async function expandSection(
  page: import('@playwright/test').Page,
  sectionId: string,
) {
  const toggle = page.getByTestId(`section-toggle-${sectionId}`);
  await expect(toggle).toBeVisible();
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * Mocks the createLeagueAndTeams mutation and resolves with the captured
 * variables so tests can assert on the input payload.
 */
async function mockCreateLeague(
  page: import('@playwright/test').Page,
  capturedInput: { current: Record<string, unknown> | null },
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const body = route.request().postData() ?? '';
    if (body.toLowerCase().includes('createleagueandteams')) {
      try {
        const parsed = JSON.parse(body) as {
          variables?: { input?: Record<string, unknown> };
        };
        capturedInput.current = parsed.variables?.input ?? null;
      } catch {
        capturedInput.current = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: {
                __typename: 'League',
                id: 777,
                name: 'Test League',
                owner: 1,
                maxRosterSize: 16,
                currentMatchup: null,
                draftStatus: 'not-started',
                numberOfTeams: 10,
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
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

test.describe('League Creation — Sport-aware @regression', () => {
  // ─── URL-driven sport selection ─────────────────────────────────────────

  test('renders the baseball form at /baseball/league/create', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible();
    // Baseball-specific era card.
    await expect(page.getByText(/Dead Ball/i)).toBeVisible();
    // Football beta banner is hidden in baseball mode.
    await expect(page.getByTestId('football-beta-banner')).toHaveCount(0);
  });

  test('renders the football form at /football/league/create', async ({
    page,
  }) => {
    await page.goto('/football/league/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(
      page.getByRole('heading', { name: /Create Football League/i }),
    ).toBeVisible();
    // Football-specific era card.
    await expect(page.getByText(/Super Bowl Era/i)).toBeVisible();
    // Football conference pool button.
    await expect(
      page.getByRole('button', { name: 'NFC', exact: true }),
    ).toBeVisible();
    // The Beta banner is rendered as a polite status region.
    await expect(page.getByTestId('football-beta-banner')).toBeVisible();
  });

  // ─── Switching sport via the SportSwitcher ──────────────────────────────

  test('clicking the Football tab navigates to /football/league/create and swaps the form', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('sport-tab-football').click();
    await expect(page).toHaveURL(/\/football\/league\/create/);
    await expect(
      page.getByRole('heading', { name: /Create Football League/i }),
    ).toBeVisible();
    await expect(page.getByText(/Super Bowl Era/i)).toBeVisible();
  });

  test('clicking the Baseball tab navigates back to /baseball/league/create', async ({
    page,
  }) => {
    await page.goto('/football/league/create');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('sport-tab-baseball').click();
    await expect(page).toHaveURL(/\/baseball\/league\/create/);
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible();
    await expect(page.getByText(/Dead Ball/i)).toBeVisible();
  });

  // ─── Submission persists `sport` ────────────────────────────────────────

  test('baseball submit sends sport=baseball in the mutation input', async ({
    page,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    await page
      .getByPlaceholder('Enter your league name')
      .fill('Hermetic Baseball League');
    await page.getByRole('button', { name: /create league/i }).click();

    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(captured.current?.sport).toBe('baseball');
  });

  test('football submit sends sport=football in the mutation input and routes under /football', async ({
    page,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await page.goto('/football/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    await page
      .getByPlaceholder('Enter your league name')
      .fill('Hermetic Football League');
    await page.getByRole('button', { name: /create league/i }).click();

    await expect(page).toHaveURL(/\/football\/league\/\d+/);
    expect(captured.current?.sport).toBe('football');
  });

  // ─── Premium gates still fire in football mode ──────────────────────────
  // The Create League premium gating is sport-agnostic, but the gates render
  // inside sport-aware sections (eras swap per FREE_ERA_IDS_BY_SPORT; FAAB +
  // salary cap controls live in the shared waiver/budget section). These
  // tests prove that a free user hitting `/football/league/create` still
  // sees the existing gates fire — protecting against regressions where the
  // sport-aware refactor accidentally bypasses a gate.

  freeUserTest(
    'free user: football mode + FAAB still triggers the premium gate',
    async ({ page }) => {
      await page.goto('/football/league/create');
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('sport-tab-football')).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await expandSection(page, 'waiver-budget');

      const faabButton = page.getByRole('button', { name: /FAAB/i }).first();
      await expect(faabButton).toBeVisible({ timeout: 10000 });
      await faabButton.click();

      await expect(page.getByTestId('premium-feature-gate')).toBeVisible({
        timeout: 10000,
      });
    },
  );

  freeUserTest(
    'free user: football mode + Salary Cap still surfaces the premium gate',
    async ({ page }) => {
      await page.goto('/football/league/create');
      await page.waitForLoadState('networkidle');

      await expandSection(page, 'waiver-budget');

      // The salary cap row sits inside a PremiumGate overlay for free users —
      // the gate itself is visible without further interaction.
      await expect(
        page.getByTestId('premium-feature-gate').filter({
          hasText: /Salary Cap/i,
        }),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  freeUserTest(
    'free user: football mode + premium era opens the era upgrade modal',
    async ({ page }) => {
      await page.goto('/football/league/create');
      await page.waitForLoadState('networkidle');

      await expandSection(page, 'era-history');

      // "Super Bowl Era" is a football-specific premium era — clicking it
      // should open the era upgrade modal rather than selecting the era.
      await page.getByText(/Super Bowl Era/i).click();

      await expect(
        page.getByText(/Historical Era Selection/i).first(),
      ).toBeVisible({ timeout: 10000 });
    },
  );
});
