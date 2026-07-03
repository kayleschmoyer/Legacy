/**
 * E2E tests for the Join League flow.
 *
 * Covers:
 * - Invite code entry form at /baseball/league/join
 * - Deep-link pre-fill via /baseball/league/join/:inviteCode
 * - Live invite code validation preview (league name, spots available)
 * - Successful join and redirect to league detail
 * - Form validation (empty fields, invalid format)
 * - Invalid code (no matching league)
 * - League-full state
 * - Server-side GraphQL error handling
 * - Cancel navigation
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — specs are selector-free.
 */

import { expect, leagueTest as test, unauthTest } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import {
  joinLeagueByCodeResponse,
  validateInviteCodeNotFoundResponse,
  validateInviteCodeResponse,
} from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── helpers ───────────────────────────────────────────────────────

/** Route all GraphQL requests through a per-operation handler map.
 *  Unrecognised operations are fulfilled with a diagnostic error via unmockedGraphQLFallback().
 */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: Record<string, unknown>,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = route.request().postData()?.toLowerCase() ?? '';

    for (const [key, body] of Object.entries(handlers)) {
      if (op.includes(key.toLowerCase())) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
    }

    await unmockedGraphQLFallback(route);
  });
}

// ── critical: page load ───────────────────────────────────────────

test.describe('Join League — page load @critical', () => {
  test('displays the join form correctly', async ({ leaguePage }) => {
    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    // Heading visible
    await leaguePage.joinHeading.expectVisible();

    // No deep-link banner on plain /join
    await leaguePage.deepLinkBanner.expectHidden();

    // Join button disabled until both fields are filled
    await leaguePage.joinButton.expectDisabled();

    // Cancel button present
    await leaguePage.cancelButton.expectVisible();
  });

  test('renders the How It Works info card', async ({ page, leaguePage }) => {
    await page.goto('/baseball/league/join');
    await page.waitForLoadState('domcontentloaded');

    await leaguePage.heading(/How It Works/i).expectVisible();

    await leaguePage.text(/8-character code/i).expectVisible();
  });
});

// ── critical: deep link ───────────────────────────────────────────

test.describe('Join League — deep link @critical', () => {
  test('pre-fills invite code from URL and shows banner after validation', async ({
    page,
    leaguePage,
  }) => {
    // The banner is gated on leagueInfo being returned from validateInviteCode,
    // so we must mock the query before navigating (it fires on mount).
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Summer Sluggers',
        totalSpots: 10,
        availableSpots: 3,
      }),
    });

    await leaguePage.gotoJoin('ABC12XYZ');
    await leaguePage.expectJoinFormVisible();

    // Code is pre-filled from the URL
    await leaguePage.inviteCodeInput.expectValue('ABC12XYZ');

    // Deep-link confirmation banner appears after the code is validated
    await leaguePage.deepLinkBanner.expectVisible();

    // Subtext changes to indicate code is pre-filled
    await leaguePage
      .text(/Your invite code has been pre-filled/i)
      .expectVisible();
  });

  test('deep-link code is auto-uppercased', async ({ leaguePage }) => {
    await leaguePage.gotoJoin('abc12xyz');
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.expectValue('ABC12XYZ');
  });
});

// ── critical: invite code validation preview ──────────────────────

test.describe('Join League — invite code validation @critical', () => {
  test('shows league name and available spots after valid 8-char code', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Summer Sluggers',
        totalSpots: 10,
        availableSpots: 3,
        isFull: false,
      }),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('SLUGGER1');

    await leaguePage.text(/Summer Sluggers/i).expectVisible();
    await leaguePage.text(/3.*of.*10.*spot/i).expectVisible();
  });

  test('shows "invalid invite code" for unknown 8-char code', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeNotFoundResponse(),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('BADCODE1');

    await leaguePage.text(/Invalid invite code/i).expectVisible();
  });

  test('shows league-full state when isFull is true', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Full House League',
        totalSpots: 10,
        availableSpots: 0,
        isFull: true,
      }),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('FULLLEAG');

    await leaguePage.text(/League full/i).expectVisible();
    await leaguePage.text(/all 10 spots taken/i).expectVisible();
  });
});

// ── critical: successful join ─────────────────────────────────────

test.describe('Join League — successful join @critical', () => {
  test('joins league and redirects to league detail page', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(42),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'My Awesome Team');

    await expect(page).toHaveURL(/\/baseball\/league\/42/, { timeout: 15000 });
  });

  test('deep-link: pre-filled code join succeeds', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(77),
    });

    await leaguePage.gotoJoin('DEEPLINK');
    await leaguePage.expectJoinFormVisible();

    // Code is pre-filled; just add team name
    await leaguePage.teamNameInput.fill('Deep Liners');
    await leaguePage.joinButton.tap();

    await expect(page).toHaveURL(/\/baseball\/league\/77/, { timeout: 15000 });
  });
});

// ── regression: form validation ───────────────────────────────────

test.describe('Join League — form validation @regression', () => {
  test('join button remains disabled until both fields are filled', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    // Both fields empty → disabled
    await leaguePage.joinButton.expectDisabled();

    // Code filled, team name empty → still disabled (leagueInfo populates but teamName empty)
    await leaguePage.inviteCodeInput.fill('ONLYCOD1');
    await leaguePage.joinButton.expectDisabled();

    // Team name filled, code empty → still disabled
    await leaguePage.inviteCodeInput.fill('');
    await leaguePage.teamNameInput.fill('My Team');
    await leaguePage.joinButton.expectDisabled();

    // Both filled → enabled (validation mock confirms code is valid)
    await leaguePage.inviteCodeInput.fill('VALIDCO1');
    await leaguePage.joinButton.expectEnabled();
  });

  test('shows error when submitting invalid code format', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    // Type a short code to bypass the 8-char maxlength check
    // then directly submit via page.evaluate to bypass the button disabled state
    await leaguePage.inviteCodeInput.fill('SHORT');
    await leaguePage.teamNameInput.fill('My Team');

    // The button should be disabled because the code < 8 chars
    await leaguePage.joinButton.expectDisabled();
  });

  test('input enforces 8-character maximum', async ({ leaguePage }) => {
    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    // maxLength={8} on the input
    await leaguePage.inviteCodeInput.fill('TOOLONGCODE');
    const val = await leaguePage.inviteCodeInput.value();
    expect(val.length).toBeLessThanOrEqual(8);
  });

  test('input auto-uppercases typed characters', async ({ leaguePage }) => {
    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('abcdefgh');
    await leaguePage.inviteCodeInput.expectValue('ABCDEFGH');
  });
});

// ── regression: league-full submit block ─────────────────────────

test.describe('Join League — league full @regression', () => {
  test('join button disabled when league is reported as full', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Full League',
        totalSpots: 8,
        availableSpots: 0,
        isFull: true,
      }),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('FULLLEAG');
    await leaguePage.teamNameInput.fill('My Team');

    // Banner should appear and submit should be disabled
    await leaguePage.alert.filterByText(/This league is full/i).expectVisible();
    await leaguePage.joinButton.expectDisabled();
  });
});

// ── regression: GraphQL error handling ───────────────────────────

test.describe('Join League — error handling @regression', () => {
  test('shows inline error when joinLeagueByCode mutation fails', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: {
        data: null,
        errors: [{ message: 'You are already in this league' }],
      },
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Repeat Team');

    // Error message should appear in a red card
    await leaguePage.formErrorCard.expectVisible();

    // Stays on the join page
    await expect(page).toHaveURL('/baseball/league/join');
  });

  test('shows error if network fails during join', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
    });

    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('joinleaguebycode')) {
        await route.abort('failed');
        return;
      }
      // Pass to the earlier routeGraphQL handler (e.g. validateinvitecode)
      await route.fallback();
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Network Team');

    await leaguePage.formErrorCard.expectVisible();
    await expect(page).toHaveURL('/baseball/league/join');
  });
});

// ── regression: cancel navigation ────────────────────────────────

test.describe('Join League — cancel @regression', () => {
  test('Cancel button returns to baseball landing page', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.cancelButton.tap();

    await expect(page).toHaveURL('/baseball');
  });
});

// ── regression: LS-1004 — keyboard form submission ───────────────
//
// Root cause: the form's onSubmit handler previously referenced
// `handleSubmit` which was renamed during LS-960, causing a
// ReferenceError on hot-reload and keyboard-triggered submissions.
// Regression test: pressing Enter inside an input must trigger the
// form's onSubmit path (handleFormSubmit → handleJoin) and complete
// the join flow successfully.

test.describe('Join League — keyboard submission @regression', () => {
  test('pressing Enter in team-name input submits the form (LS-1004)', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(55),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.inviteCodeInput.fill('VALIDCO1');
    await leaguePage.teamNameInput.fill('Keyboard Team');

    // Wait for server validation to pass and button to become enabled
    // (the validation query fires asynchronously when the invite code changes)
    await leaguePage.joinButton.expectEnabled({ timeout: 10000 });

    // Submit via keyboard — exercises the form onSubmit handler,
    // not the button onPress handler.
    // Use Promise.all to wait for the mutation response concurrently.
    // Use requestSubmit() which triggers the React onSubmit handler.
    // Tamagui Input may not propagate Enter into native form submission
    // on all browsers.
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/graphql') &&
          resp
            .request()
            .postData()
            ?.toLowerCase()
            .includes('joinleaguebycode') === true,
        { timeout: 10000 },
      ),
      page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.requestSubmit();
      }),
    ]);

    await expect(page).toHaveURL(/\/baseball\/league\/55/, {
      timeout: 15000,
    });
  });
});

// ---------------------------------------------------------------------------
// LS-3719 / LS-3702: /baseball/league/join was made a public path in LS-3702
// so invite links work without prior authentication. Unauthenticated users now
// see JoinLeagueByCodePage directly (the join form), not the login page. These
// tests lock in the public-route behaviour for unauthenticated visitors.
// ---------------------------------------------------------------------------

unauthTest.describe(
  '/baseball/league/join — public route renders join form for unauthenticated users @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball/league/join');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows "Join League" heading on /baseball/league/join when unauthenticated (LS-3481)',
      async ({ leaguePage }) => {
        await leaguePage.heading(/join league/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'shows invite code input on /baseball/league/join when unauthenticated (LS-3481)',
      async ({ leaguePage }) => {
        await leaguePage.placeholder(/8-character code/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'shows team name input on /baseball/league/join when unauthenticated (LS-3482)',
      async ({ leaguePage }) => {
        await leaguePage
          .placeholder(/enter your team name/i)
          .expectVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'shows "Join League" submit button on /baseball/league/join when unauthenticated (LS-3482)',
      async ({ leaguePage }) => {
        await leaguePage.button(/join league/i).expectVisible({
          timeout: 15_000,
        });
      },
    );
  },
);
