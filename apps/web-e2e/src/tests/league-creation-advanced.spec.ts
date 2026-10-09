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
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Free-tier identity, with page objects injected. */
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

/** Extract `variables.input.numberOfDivisions` from a captured mutation request body. */
function readSubmittedDivisions(postData: string): number | undefined {
  const parsed = JSON.parse(postData) as {
    variables?: { input?: { numberOfDivisions?: number } };
  };
  return parsed.variables?.input?.numberOfDivisions;
}

/** Mock a successful createLeagueAndTeams response */
async function mockCreateLeagueSuccess(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();
    if (operation === 'createleagueandteams') {
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
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    // All preset roster sizes should be visible
    for (const size of ['20', '22', '24', '26', '28', '30', '35', '40']) {
      await leaguePage.button(size, { exact: true }).expectVisible();
    }

    // Hint text is visible
    await leaguePage.text('Active + bench.').expectVisible();
  });

  test('should select a roster size when clicked', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateLeagueSuccess(page);
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    // Click roster size 30
    await leaguePage.clickButton('30', { exact: true });

    // Fill name and submit to verify the selection was accepted (form submits)
    await leaguePage.fillLeagueName('My League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Player Pool ──────────────────────────────────────────────────────────

  test('should display all player pool options', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await leaguePage.button('All MLB').expectVisible();
    await leaguePage.button('National League').expectVisible();
    await leaguePage.button('American League').expectVisible();

    await leaguePage
      .text("Narrow the league to a single league's talent")
      .expectVisible();
  });

  test('should allow selecting National League player pool', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateLeagueSuccess(page);
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await leaguePage.clickButton('National League');
    await leaguePage.fillLeagueName('NL League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Scheduling Strategy ──────────────────────────────────────────────────

  test('should display all scheduling strategy options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    await leaguePage.button('Divisional').expectVisible();
    await leaguePage.button('Round Robin').expectVisible();
    await leaguePage.button('Random').first().expectVisible();

    await leaguePage
      .text('Divisional schedules prioritize in-division matchups')
      .expectVisible();
  });

  test('should select a scheduling strategy when clicked', async ({
    page,
    leaguePage,
  }) => {
    await mockCreateLeagueSuccess(page);
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Roster & Schedule section
    await leaguePage.expandSection('roster-schedule');

    // Click Round Robin scheduling strategy
    await leaguePage.clickButton('Round Robin');

    // Fill name and submit to verify the selection was accepted (form submits)
    await leaguePage.fillLeagueName('Round Robin League');
    await leaguePage.submitCreate();

    // Confirm the post-create "League created!" dialog (LS-6067) before the
    // page navigates to the new league.
    await leaguePage.continueToLeague();

    // LS-8474: this is the one test in the file whose setup changes
    // schedulingStrategy away from its 'divisional' default, which unmounts
    // the "Advanced Scheduling" PremiumGate section a few steps earlier —
    // the extra teardown work is the only structural difference from the
    // sibling roster-size/player-pool tests below, which never fail here.
    // The mutation itself is fully mocked (no server round-trip), so the
    // SPA route change is otherwise near-instant; under CI's 4-worker
    // parallel load this occasionally lands just past the suite-wide 3s
    // `expect.timeout`, while it always passes in isolation locally.
    // Wait for the navigation explicitly with a more generous budget rather
    // than loosening the global timeout for the rest of the suite; the
    // assertion below still pins the exact destination.
    await page.waitForURL(/\/baseball\/league\/\d+/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  // ─── Number of Divisions ──────────────────────────────────────────────────

  test('should display division count section with heading and helper text', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.text('Number of Divisions').expectVisible();
    await leaguePage.text('How many divisions to split').expectVisible();
  });

  test('should select a division count and submit it as numberOfDivisions (LS-5365)', async ({
    page,
    leaguePage,
  }) => {
    let submittedDivisions: number | undefined;
    await page.route(isGraphQLEndpoint, async (route) => {
      if (
        extractOperationName(route).toLowerCase() === 'createleagueandteams'
      ) {
        submittedDivisions = readSubmittedDivisions(
          route.request().postData() ?? '',
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: { __typename: 'League', id: 77 },
              },
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Default team count (12) allows division options 1 and 2 (each division
    // needs at least 6 teams) — select 1.
    await leaguePage.selectDivisionCount(1);
    await leaguePage.fillLeagueName('Division Pick League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(submittedDivisions).toBe(1);
  });

  test('should filter division options to team-count parity and reset an invalid selection (LS-5365)', async ({
    page,
    leaguePage,
  }) => {
    let submittedDivisions: number | undefined;
    await page.route(isGraphQLEndpoint, async (route) => {
      if (
        extractOperationName(route).toLowerCase() === 'createleagueandteams'
      ) {
        submittedDivisions = readSubmittedDivisions(
          route.request().postData() ?? '',
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: { __typename: 'League', id: 78 },
              },
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Default is 12 teams / 2 divisions. Flip team count to an odd value (7) —
    // two divisions is no longer valid (parity, and each division needs at
    // least 6 teams), so it snaps to the only remaining option (1 —
    // LeagueCreatePage handleInputChange, LS-6060).
    await leaguePage.selectTeamCount(7);

    await leaguePage
      .text(/With 7 teams, only odd division counts \(1\) are allowed/)
      .expectVisible();
    await leaguePage.numberOfDivisionsField
      .byRole('button', { name: '2', exact: true })
      .expectHidden();
    await leaguePage.numberOfDivisionsField
      .byRole('button', { name: '4', exact: true })
      .expectHidden();

    await leaguePage.fillLeagueName('Parity Reset League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(submittedDivisions).toBe(1);
  });

  // ─── Draft Mode ───────────────────────────────────────────────────────────

  test('should display Live Draft and Automated Draft options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await leaguePage.button('Live Draft').expectVisible();
    await leaguePage.button('Automated Draft').expectVisible();

    await leaguePage
      .text('Live drafts require all managers online')
      .expectVisible();
  });

  test('should hide Standard/Auction selection method options when Automated Draft is selected (LS-6078)', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    // Switch to Automated Draft
    await leaguePage.clickButton('Automated Draft');

    // Selection method is forced to Random — Standard/Auction are hidden, not
    // shown disabled, so users aren't misled into thinking they're unlockable.
    // exact: true avoids matching the collapsed "Waivers, Budget & Salary Cap"
    // section toggle, whose summary text substring-matches "Standard waivers".
    await leaguePage.button('Random', { exact: true }).expectVisible();
    await leaguePage.button('Standard', { exact: true }).expectHidden();
    await leaguePage.button('Auction', { exact: true }).expectHidden();

    // Explanatory note should mention automated
    await leaguePage
      .text(/Automated drafts use random player assignment/)
      .expectVisible();
  });

  test('should restore Standard/Auction selection method options when switching back to Live Draft', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await leaguePage.clickButton('Automated Draft');
    await leaguePage.clickButton('Live Draft');

    // Selection method buttons should be visible and enabled again
    await leaguePage.button('Standard').first().expectEnabled();
    await leaguePage.button('Auction').expectEnabled();
  });

  // ─── Selection Method ─────────────────────────────────────────────────────

  test('should display Standard, Auction, and Random selection methods', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await leaguePage.button('Standard').first().expectVisible();
    await leaguePage.button('Auction').expectVisible();
    // Hint describes only the selected method (Standard by default, LS-10813)
    await leaguePage
      .text('Teams take turns picking players in draft order.')
      .expectVisible();
  });

  test('should show auction budget and min bid inputs when Auction is selected', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    // Auction budget section not visible until Auction selection method is chosen
    // Select Auction selection method
    await leaguePage.clickButton('Auction');

    // Auction budget and min bid inputs should now appear
    await leaguePage.text('Auction Budget per Team').expectVisible();
    await leaguePage.text('Minimum Bid').expectVisible();
    await leaguePage.placeholder('200').expectVisible();
    await leaguePage.placeholder('1').expectVisible();
  });

  test('selecting Auction selection method is reflected in the Draft Settings summary (LS-5367)', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Auction');

    // Collapse the section to reveal its one-line summary, which renders
    // `formData.selectionMethod` verbatim — proves the selection persisted
    // into form state, not just a visual toggle.
    await leaguePage.collapseSection('draft');
    const summary = await leaguePage.sectionSummary('draft').text();
    expect(summary).toMatch(/auction/i);
  });

  test('should show a validation error when minimum bid exceeds auction budget', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section and select Auction
    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Auction');

    // Set min bid above the budget (LS-6075: this used to be silently accepted)
    await leaguePage.placeholder('200').fill('200');
    await leaguePage.placeholder('1').fill('500');

    await leaguePage
      .text('Auction minimum bid cannot exceed auction budget.')
      .first()
      .expectVisible();
  });

  // ─── Draft Order ──────────────────────────────────────────────────────────

  test('should display Snake and Linear draft order options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Draft Settings section
    await leaguePage.expandSection('draft');

    await leaguePage.button('Snake', { exact: true }).expectVisible();
    await leaguePage.button('Linear', { exact: true }).expectVisible();
    await leaguePage.text('Snake order reverses each round').expectVisible();
  });

  test('selecting Linear draft order is reflected in the Draft Settings summary (LS-5367)', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Linear', { exact: true });

    // Collapse the section to reveal its one-line summary, which renders
    // `formData.draftOrder` verbatim — proves the selection persisted into
    // form state, not just a visual toggle.
    await leaguePage.collapseSection('draft');
    const summary = await leaguePage.sectionSummary('draft').text();
    expect(summary).toMatch(/linear/i);
  });

  // ─── Waiver System ────────────────────────────────────────────────────────

  test('should display Standard and FAAB waiver options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Waivers, Budget & Salary Cap section
    await leaguePage.expandSection('waiver-budget');

    await leaguePage.text('Waiver System').expectVisible();
    // The default (premium) identity lands with FAAB pre-checked (LS-6910).
    await leaguePage.text('FAAB: weekly blind bidding').expectVisible();

    await leaguePage.testId('create-league-waiver-type-standard').tap();
    await leaguePage.text('Teams have a priority order').expectVisible();
  });

  freeUserTest(
    'should show upgrade modal when free user clicks FAAB waiver option',
    async ({ page, leaguePage }) => {
      // Premium status is sourced from GetUserById, whose baseline mock now
      // returns a premium user (LS-5030 / #5236). Pin this user back to free so
      // the FAAB PremiumGate actually fires for this gate-verification test.
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();

      // Expand the Waivers, Budget & Salary Cap section
      await leaguePage.expandSection('waiver-budget');

      // Click the FAAB waiver option — for a free user this triggers the
      // upgrade gate (PremiumGate wraps the option and intercepts the click).
      const faabButton = leaguePage.button(/FAAB/i).first();
      await faabButton.expectVisible({ timeout: 10000 });
      await faabButton.tap();

      // Free user should see the premium gate overlay.
      await leaguePage.premiumGate.expectVisible({ timeout: 10000 });
    },
  );

  adminTest(
    'should let a premium user enter a custom FAAB budget and validate its range (LS-6116)',
    async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await leaguePage.gotoCreate();
      await leaguePage.fillLeagueName('Custom FAAB League');

      await leaguePage.expandSection('waiver-budget');
      await leaguePage.clickButton(/FAAB/i, { exact: false });
      await leaguePage.text('FAAB Budget (per manager)').expectVisible();

      // Presets stay exactly as-is alongside the new "Custom" option.
      await leaguePage.button('$100', { exact: true }).expectVisible();
      await leaguePage.button('Custom', { exact: true }).expectVisible();

      await leaguePage.clickButton('Custom', { exact: true });
      await leaguePage.faabBudgetCustomInput.expectVisible();

      // Out-of-range amount surfaces the validation error — both inline on
      // the field and in the sticky status bar render the same message, so
      // scope to the first match to avoid a Playwright strict-mode error.
      await leaguePage.fillFaabBudgetAmount(500000);
      await leaguePage
        .text(/FAAB budget must be/i)
        .first()
        .expectVisible();

      // Back in range clears the error.
      await leaguePage.fillFaabBudgetAmount(1000);
      await leaguePage.text('All settings look good.').expectVisible();
    },
  );

  // ─── Hall of Fame Only ────────────────────────────────────────────────────

  test('should toggle Hall of Fame Only mode text', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    // Default state
    await leaguePage.text('🏆 Off').expectVisible();
    await leaguePage.text('Hall of Fame Draft Mode').expectVisible();

    // Toggle ON
    await leaguePage.clickText('🏆 Off');
    await leaguePage.text('🏆 On').expectVisible();

    // Toggle OFF again
    await leaguePage.clickText('🏆 On');
    await leaguePage.text('🏆 Off').expectVisible();
  });

  // ─── Era Filter ───────────────────────────────────────────────────────────

  test('should display Historical Era Filter section', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    await leaguePage.text('Historical Era Filter').expectVisible();
    // EraFilterGrid (LS-5174) renders each era as a Tamagui card whose
    // accessible name is the era name only (`aria-label={era.name}`); the year
    // range is separate muted text. Match the option by its accessible name and
    // assert the year range via its own text node.
    await leaguePage.button('All Eras').expectVisible();
    await leaguePage.text(/1871\s*[–-]\s*Now/).expectVisible();
    await leaguePage.text('Dead Ball (pre-1920)').expectVisible();
    await leaguePage.text('Modern (2006+)').expectVisible();
  });

  test('should show custom era year inputs when Custom Era is selected', async ({
    page,
    leaguePage,
  }) => {
    // Custom Era is a premium-gated control — establish premium before nav.
    await useTier(page, 'premium');
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    // Custom Era year inputs should not be visible initially
    await leaguePage.placeholder('e.g. 1940').expectHidden();
    await leaguePage.placeholder('e.g. 1960').expectHidden();

    // Click Custom Era
    await leaguePage.clickText('Custom Era');

    // Year range inputs should now appear
    await leaguePage.placeholder('e.g. 1940').expectVisible();
    await leaguePage.placeholder('e.g. 1960').expectVisible();
    await leaguePage.text('Start Year').expectVisible();
    await leaguePage.text('End Year').expectVisible();
  });

  test('should hide custom era inputs when switching away from Custom Era', async ({
    page,
    leaguePage,
  }) => {
    // Custom Era is a premium-gated control — establish premium before nav.
    await useTier(page, 'premium');
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Era & History section
    await leaguePage.expandSection('era-history');

    await leaguePage.clickText('Custom Era');
    await leaguePage.placeholder('e.g. 1940').expectVisible();

    // Switch back to All Eras
    await leaguePage.clickText('All Eras');
    await leaguePage.placeholder('e.g. 1940').expectHidden();
  });

  freeUserTest(
    'should show upgrade modal when free user clicks a premium era option',
    async ({ page, leaguePage }) => {
      // Premium status is sourced from GetUserById, whose baseline mock now
      // returns a premium user (LS-5030 / #5236). Pin this user back to free so
      // the era-selection upgrade gate actually fires for this test (LS-5368).
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();

      // Expand the Era & History section
      await leaguePage.expandSection('era-history');

      // Clicking a locked (premium) era as a free user opens the Upgrade
      // modal instead of applying the selection — EraFilterGrid routes the
      // tap to `onUpgrade` (LS-5174).
      await leaguePage.clickButton('Dead Ball (pre-1920)');

      // Scoped to the modal dialog rather than raw text — the
      // Duplicate-from-Existing-League card (LS-6062) also shows an
      // "Upgrade to Premium" CTA for free users, which would otherwise make
      // a page-wide text locator ambiguous.
      await leaguePage.upgradeModal.expectVisible({ timeout: 10000 });
      await leaguePage
        .text('Unlock Historical Era Selection and more')
        .expectVisible();
    },
  );

  // ─── League Visibility ────────────────────────────────────────────────────

  test('should display Private and Public league visibility options', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.text('League Visibility').expectVisible();
    await leaguePage.text('🔒 Private').expectVisible();
    await leaguePage.text('🌐 Public').expectVisible();

    // Default description for private
    await leaguePage
      .text('Only people with your invite code can join')
      .expectVisible();
  });

  test('should change visibility description when switching to Public', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.clickText('🌐 Public');

    await leaguePage
      .text('Anyone can browse and join this league')
      .expectVisible();
  });

  // ─── Salary Cap ───────────────────────────────────────────────────────────

  test('should display Salary Cap toggle', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Expand the Waivers, Budget & Salary Cap section
    await leaguePage.expandSection('waiver-budget');

    await leaguePage.text('Enable Salary Cap').expectVisible();
    await leaguePage
      .text('Track player salaries and enforce roster spending limits')
      .expectVisible();
  });

  adminTest(
    'should show salary cap limit input when Enable Salary Cap is toggled',
    async ({ page, leaguePage }) => {
      // Salary Cap is wrapped in a PremiumGate — establish premium before nav
      // so the gate overlay does not intercept the toggle click.
      await useTier(page, 'premium');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();

      // Expand the Waivers, Budget & Salary Cap section
      await leaguePage.expandSection('waiver-budget');

      // Premium users land with the salary cap pre-checked (LS-6910)
      await leaguePage.placeholder('e.g. 50000000').expectVisible();

      // Turning it off hides the cap limit input
      await leaguePage.clickButton('Off', { exact: true });
      await leaguePage.placeholder('e.g. 50000000').expectHidden();

      // Click the "On" button in the Enable Salary Cap PillToggle
      await leaguePage.clickButton('On', { exact: true });

      // Cap limit input should now be visible
      await leaguePage.placeholder('e.g. 50000000').expectVisible();
      await leaguePage.text('Salary Cap Limit').expectVisible();
      await leaguePage
        .text('Maximum total salary each team can spend')
        .expectVisible();
    },
  );

  adminTest(
    'should retain waiver type, FAAB budget, and salary cap amount after collapsing and re-expanding the section (LS-5373)',
    async ({ page, leaguePage }) => {
      // FAAB waivers and salary cap are both premium-gated.
      await useTier(page, 'premium');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();

      await leaguePage.expandSection('waiver-budget');

      // Select FAAB waiver type and a preset FAAB budget.
      await leaguePage.clickButton(/FAAB/i, { exact: false });
      await leaguePage.clickButton('$200', { exact: true });

      // Enable salary cap and enter an amount.
      await leaguePage.clickButton('On', { exact: true });
      await leaguePage.fillSalaryCapAmount(20000000);

      // Collapsing the section renders a summary derived from form state —
      // the mechanism that proves the selections persisted, since the
      // underlying option buttons carry no aria-pressed/aria-selected state.
      const sectionToggle = leaguePage.testId('section-toggle-waiver-budget');
      await sectionToggle.tap();
      await sectionToggle.expectContainsText('FAAB · $200 · $20000000M cap');

      // Re-expanding confirms the salary cap input itself retained its
      // value and stayed visible (proving salaryCapEnabled stayed true).
      await leaguePage.expandSection('waiver-budget');
      await leaguePage.salaryCapAmountInput.expectValue('20000000');
    },
  );

  // ─── Form Validation (inline error card) ──────────────────────────────────

  test('submit button is enabled even with a short league name', async ({
    leaguePage,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.fillLeagueName('Ab');
    await leaguePage.createButton.expectEnabled();

    // Clicking shows a validation error without crashing the page
    await leaguePage.submitCreate();
    await leaguePage.alert.expectVisible();
    await leaguePage.expectNoAppError();
  });

  // "Name too long" is covered in create-league-form-validation.spec.ts
  // (LS-10446) and at the unit level (LeagueCreatePage.spec.tsx).

  test('submit button is always enabled regardless of league name length', async ({
    leaguePage,
  }) => {
    // The button is always enabled — validation fires on submit (LS-2953).
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Short name — button is still enabled (validation fires on submit)
    await leaguePage.fillLeagueName('Ab');
    await leaguePage.createButton.expectEnabled();

    // Valid name — button remains enabled
    await leaguePage.fillLeagueName('Fixed League Name');
    await leaguePage.createButton.expectEnabled();
  });

  test('should display GraphQL network error in inline error card', async ({
    page,
    leaguePage,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'createleagueandteams') {
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
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('My League');
    await leaguePage.submitCreate();

    // The app should show an error state — either an inline error card,
    // an apollo toast, or a role="alert" element
    await leaguePage.expectCreateErrorSurfaced();
    await expect(page).toHaveURL('/baseball/league/create');
  });

  // ─── URL Pre-fill (LS-5372) ───────────────────────────────────────────────

  test('should pre-fill the league name from the ?name= query param', async ({
    page,
    leaguePage,
  }) => {
    await page.route('**/graphql**', async (route) =>
      unmockedGraphQLFallback(route),
    );
    await leaguePage.gotoCreateWithName('Diamond Dynasty');

    await leaguePage.leagueNameInput.expectValue('Diamond Dynasty');
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
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.button(/^cancel$/i).tap();
    await expect(page).toHaveURL('/baseball');
  });

  // ─── "What happens next" Info Card ───────────────────────────────────────

  test('should display league creation info card with all bullet points', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.text('What happens next').expectVisible();
    await leaguePage
      .text("Your league is created and you're set as Commissioner")
      .expectVisible();
    await leaguePage.text('Send invite links').expectVisible();
    await leaguePage.text('Draft opens').expectVisible();
  });

  // ─── Error States (LS-2118) ────────────────────────────────────────────────
  //
  // Rate limiting and network-timeout failures both reach the submit handler
  // as non-GraphQL errors (a `ServerError` with an HTTP status, or a plain
  // network Error) — LeagueCreatePage's `getSubmitErrorMessage` (LS-6069)
  // only trusts `CombinedGraphQLErrors` carrying an allowlisted `code`, so
  // both cases fall back to the same generic, non-leaking message. The
  // "duplicate name" GraphQL error path (`BAD_USER_INPUT`, safe to display
  // verbatim) is already covered by league-creation.spec.ts's "should handle
  // GraphQL errors gracefully" — not duplicated here.

  test('recovers automatically from a transient rate-limit response without ever surfacing an error', async ({
    page,
    leaguePage,
  }) => {
    // apollo-client.ts's `rateLimitRetryLink` (LS-8138) retries a 429/503
    // HTTP response up to 4 attempts before the mutation's catch block ever
    // sees it — a momentarily saturated backend should recover silently.
    let attempts = 0;
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation !== 'createleagueandteams') {
        await unmockedGraphQLFallback(route);
        return;
      }

      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Too Many Requests' }] }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: { __typename: 'League', id: 556 },
            },
          },
        }),
      });
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Rate Limited League');
    await leaguePage.submitCreate();

    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(attempts).toBe(2);
  });

  test('shows the generic fallback message and preserves form state once rate-limit retries are exhausted', async ({
    page,
    leaguePage,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'createleagueandteams') {
        // Every attempt (including the rateLimitRetryLink's own 4 internal
        // retries) is rejected — there is no successful response to recover on.
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Too Many Requests' }],
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Rate Limited League');
    await leaguePage.submitCreate();

    // A 429 has no GraphQL extensions.code to trust, so the raw "Too Many
    // Requests" text must never reach the UI — only the generic fallback.
    await leaguePage
      .text(
        'Unable to save league. Your settings are still filled in — try again or come back later.',
      )
      .expectVisible({ timeout: 20000 });
    await leaguePage.text('Too Many Requests').expectHidden();

    // Form stays on the create page with the entered data intact, ready
    // for the user to retry — partial-submission recovery.
    await expect(page).toHaveURL('/baseball/league/create');
    await leaguePage.leagueNameInput.expectValue('Rate Limited League');
  });

  test('recovers automatically from a transient network timeout without ever surfacing an error', async ({
    page,
    leaguePage,
  }) => {
    // apollo-client.ts's transient-network `retryLink` (LS-900) retries a
    // plain network failure (no HTTP status, e.g. an aborted/timed-out
    // request) up to 3 attempts before the mutation's catch block ever sees
    // it — so a single dropped request should recover with no user-visible
    // error at all, not just a friendly fallback message.
    let attempts = 0;
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation !== 'createleagueandteams') {
        await unmockedGraphQLFallback(route);
        return;
      }

      attempts += 1;
      if (attempts === 1) {
        await route.abort('timedout');
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: { __typename: 'League', id: 555 },
            },
          },
        }),
      });
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Timeout Retry League');
    await leaguePage.submitCreate();

    // A single click drives the whole retry-then-succeed sequence — the
    // in-flight submit error banner from a transient hiccup is never shown.
    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
    expect(attempts).toBe(2);
  });

  test('shows the generic fallback message and preserves form state once timeout retries are exhausted', async ({
    page,
    leaguePage,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'createleagueandteams') {
        // Every attempt (including the retryLink's own 3 internal retries)
        // times out — there is no successful response left to recover on.
        await route.abort('timedout');
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Timeout League');
    await leaguePage.submitCreate();

    await leaguePage
      .text(
        'Unable to save league. Your settings are still filled in — try again or come back later.',
      )
      .expectVisible({ timeout: 15000 });
    await expect(page).toHaveURL('/baseball/league/create');

    // Partial-submission recovery: the league name survived the failed
    // attempt, so the user can retry without re-filling the form.
    await leaguePage.leagueNameInput.expectValue('Timeout League');
  });

  // ─── Team Count Edge Cases ──────────────────────────────────────────────────

  for (const teamCount of [4, 16]) {
    test(`should submit numberOfTeams correctly at the ${teamCount}-team boundary`, async ({
      page,
      leaguePage,
    }) => {
      let submittedTeams: number | undefined;
      await page.route(isGraphQLEndpoint, async (route) => {
        const operation = extractOperationName(route).toLowerCase();
        if (operation !== 'createleagueandteams') {
          await unmockedGraphQLFallback(route);
          return;
        }
        const parsed = JSON.parse(route.request().postData() ?? '') as {
          variables?: { input?: { numberOfTeams?: number } };
        };
        submittedTeams = parsed.variables?.input?.numberOfTeams;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: { __typename: 'League', id: 321 },
              },
            },
          }),
        });
      });

      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
      await leaguePage.selectTeamCount(teamCount);
      await leaguePage.fillLeagueName(`${teamCount}-Team League`);
      await leaguePage.submitCreate();
      await leaguePage.continueToLeague();

      await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
      expect(submittedTeams).toBe(teamCount);
    });
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  test('should show Creating... text on button while submitting', async ({
    page,
    leaguePage,
  }) => {
    // Delay the response so we can catch the loading state
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'createleagueandteams') {
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
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('My Fast League');
    await leaguePage.submitCreate();

    // During submission the button text should change
    await leaguePage.creatingButton.expectVisible();
  });
});
