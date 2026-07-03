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
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — specs are selector-free.
 *
 * Complements:
 *  - league-creation.spec.ts (baseball happy path)
 *  - league-creation-advanced.spec.ts (advanced settings + baseline FAAB gate)
 */

import { customAuthTest, expect, leagueTest as test } from '../fixtures/pages';
import {
  enableFootball,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Free-tier identity, with page objects injected. */
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

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
    leaguePage,
  }) => {
    // football_enabled gates the football tab (LS-4767, off in CI); seed it so
    // the inactive football tab is present to assert aria-selected=false on.
    await enableFootball(page);
    await leaguePage.gotoCreate('baseball');

    await leaguePage
      .sportTab('baseball')
      .expectAttribute('aria-selected', 'true');
    await leaguePage
      .sportTab('football')
      .expectAttribute('aria-selected', 'false');
    await leaguePage.createTitle('baseball').expectVisible();
    // Baseball-specific era card — expand the era section first.
    await leaguePage.expandSection('era-history');
    await leaguePage.text(/Dead Ball/i).expectVisible();
    // Football beta banner is hidden in baseball mode.
    await leaguePage.footballBetaBanner.expectCount(0);
  });

  test('renders the football form at /football/league/create', async ({
    page,
    leaguePage,
  }) => {
    await enableFootball(page);
    await leaguePage.gotoCreate('football');

    await leaguePage
      .sportTab('football')
      .expectAttribute('aria-selected', 'true');
    await leaguePage
      .sportTab('baseball')
      .expectAttribute('aria-selected', 'false');
    await leaguePage.createTitle('football').expectVisible();
    // Football-specific era card — expand the era section first.
    await leaguePage.expandSection('era-history');
    await leaguePage.text(/Super Bowl Era/i).expectVisible();
    // Football conference pool button — expand roster section first.
    await leaguePage.expandSection('roster-schedule');
    await leaguePage.button('NFC', { exact: true }).expectVisible();
    // The Beta banner is rendered as a polite status region.
    await leaguePage.footballBetaBanner.expectVisible();
  });

  // ─── Switching sport via the SportSwitcher ──────────────────────────────

  test('clicking the Football tab navigates to /football/league/create and swaps the form', async ({
    page,
    leaguePage,
  }) => {
    await enableFootball(page);
    await leaguePage.gotoCreate('baseball');

    await leaguePage.switchSport('football');
    await expect(page).toHaveURL(/\/football\/league\/create/);
    await leaguePage.createTitle('football').expectVisible();
    // Football-specific era card — expand the era section first.
    await leaguePage.expandSection('era-history');
    await leaguePage.text(/Super Bowl Era/i).expectVisible();
  });

  test('clicking the Baseball tab navigates back to /baseball/league/create', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');

    await leaguePage.switchSport('baseball');
    await expect(page).toHaveURL(/\/baseball\/league\/create/);
    await leaguePage.createTitle('baseball').expectVisible();
    // Baseball-specific era card — expand the era section first.
    await leaguePage.expandSection('era-history');
    await leaguePage.text(/Dead Ball/i).expectVisible();
  });

  // ─── Submission persists `sport` ────────────────────────────────────────

  test('baseball submit sends sport=baseball in the mutation input', async ({
    page,
    leaguePage,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await leaguePage.gotoCreate('baseball');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.fillLeagueName('Hermetic Baseball League');
    await leaguePage.submitCreate();

    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(captured.current?.sport).toBe('baseball');
  });

  test('football submit sends sport=football in the mutation input and routes under /football', async ({
    page,
    leaguePage,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.fillLeagueName('Hermetic Football League');
    await leaguePage.submitCreate();

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
    async ({ page, leaguePage }) => {
      // Premium is sourced from GetUserById, whose baseline mock now returns a
      // premium user (LS-5030 / #5236); pin this user to free so the gate fires.
      await useTier(page, 'free');
      await enableFootball(page);
      await leaguePage.gotoCreate('football');

      await leaguePage
        .sportTab('football')
        .expectAttribute('aria-selected', 'true');

      await leaguePage.expandSection('waiver-budget');

      const faabButton = leaguePage.button(/FAAB/i).first();
      await faabButton.expectVisible({ timeout: 10000 });
      await faabButton.tap();

      await leaguePage.premiumGate.expectVisible({
        timeout: 10000,
      });
    },
  );

  freeUserTest(
    'free user: football mode + Salary Cap still surfaces the premium gate',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate('football');

      await leaguePage.expandSection('waiver-budget');

      // The salary cap row sits inside a PremiumGate overlay for free users —
      // the gate itself is visible without further interaction.
      await leaguePage.premiumGate
        .filterByText(/Salary Cap/i)
        .expectVisible({ timeout: 10000 });
    },
  );

  freeUserTest(
    'free user: football mode + premium era opens the era upgrade modal',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate('football');

      await leaguePage.expandSection('era-history');

      // "Super Bowl Era" is a football-specific premium era — clicking it
      // should open the era upgrade modal rather than selecting the era.
      await leaguePage.clickText(/Super Bowl Era/i);

      await leaguePage
        .text(/Historical Era Selection/i)
        .first()
        .expectVisible({ timeout: 10000 });
    },
  );
});
