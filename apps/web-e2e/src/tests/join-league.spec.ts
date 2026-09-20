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
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import {
  joinLeagueByCodeResponse,
  validateInviteCodeNotFoundResponse,
  validateInviteCodeResponse,
} from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── helpers ───────────────────────────────────────────────────────

/** Route all GraphQL requests through a per-operation handler map.
 *  Keys are FULL GraphQL operation names, matched case-insensitively for exact
 *  equality against the extracted operation name (LS-9794/LS-9866); a substring
 *  test on the raw POST body can match more than one operation and fulfill the
 *  route with the wrong response shape.
 *  Unrecognised operations are fulfilled with a diagnostic error via unmockedGraphQLFallback().
 */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: Record<string, unknown>,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    for (const [key, body] of Object.entries(handlers)) {
      if (operation === key.toLowerCase()) {
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

/** A single scripted GraphQL response: either a fulfilled body or an aborted
 *  ("failed") network request. */
type ScriptedResponse = { abort: true } | { body: unknown };

/**
 * Route GraphQL requests with a per-operation queue of one-shot responses,
 * falling back to `handlers` (by exact operation name, matching {@link
 * routeGraphQL}) once an operation's queue is drained. This lets a spec
 * script an operation to fail on its first call and succeed on a retry,
 * without ever touching the real network (`route.abort`/`route.fulfill`
 * only — no `route.continue`).
 */
async function routeGraphQLWithRetry(
  page: import('@playwright/test').Page,
  handlers: Record<string, unknown>,
  sequenced: Record<string, ScriptedResponse[]>,
) {
  const queues = new Map(
    Object.entries(sequenced).map(([key, responses]) => [
      key.toLowerCase(),
      [...responses],
    ]),
  );

  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    const queue = queues.get(operation);
    if (queue && queue.length > 0) {
      const next = queue.shift() as ScriptedResponse;
      if ('abort' in next) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(next.body),
        });
      }
      return;
    }

    for (const [key, body] of Object.entries(handlers)) {
      if (operation === key.toLowerCase()) {
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

/** A GraphQL error response shaped like the server's `graphql-errors.ts`
 *  factories (`extensions.code` + message), for scripting `joinLeagueByCode`
 *  failures without depending on the lambda. */
function joinLeagueErrorResponse(message: string, code?: string) {
  return {
    data: null,
    errors: [{ message, ...(code && { extensions: { code } }) }],
  };
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
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'joinleaguebycode') {
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

// ── regression: retry after network error (LS-2119) ──────────────

test.describe('Join League — retry after network error @regression', () => {
  test('retrying after a network failure succeeds without reloading the page', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
    });
    // Every joinLeagueByCode attempt fails while the network is down. A
    // single scripted failure isn't reliable here — Apollo's `retryLink`
    // (apollo-client.ts) transparently retries transient network errors up
    // to 3 times, so a one-shot abort can get silently absorbed before the
    // UI ever sees it.
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'joinleaguebycode') {
        await route.abort('failed');
        return;
      }
      await route.fallback();
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Retry Team');

    // The network failure (plus retryLink's exhausted backoff) surfaces an
    // inline error rather than navigating away.
    await leaguePage.formErrorCard.expectVisible({ timeout: 15000 });
    await expect(page).toHaveURL('/baseball/league/join');

    // The join button re-enables after the failed attempt so the user can retry.
    await leaguePage.joinButton.expectEnabled();

    // The network recovers — swap in a route that succeeds — and the user
    // retries via the same button without reloading the page.
    await page.unroute(isGraphQLEndpoint);
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(88),
    });

    await leaguePage.joinButton.tap();

    await expect(page).toHaveURL(/\/baseball\/league\/88/, { timeout: 15000 });
  });
});

// ── regression: clear error and rejoin (LS-2119) ──────────────────

test.describe('Join League — clear error and rejoin @regression', () => {
  test('clears the error banner and successfully joins on the next attempt', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQLWithRetry(
      page,
      {
        validateinvitecode: validateInviteCodeResponse(),
        joinleaguebycode: joinLeagueByCodeResponse(91),
      },
      {
        joinleaguebycode: [
          { body: joinLeagueErrorResponse('You are already in this league') },
        ],
      },
    );

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'First Team');

    // Scope the text match to the inline card itself — the same message is
    // also broadcast to the global ApolloErrorToast (apollo-client.ts), so a
    // page-wide text lookup would be ambiguous.
    await leaguePage.formErrorCard
      .filterByText(/already in this league/i)
      .expectVisible();

    // Correct the team name and rejoin — the previous error must not linger.
    await leaguePage.teamNameInput.fill('Corrected Team');
    await leaguePage.joinButton.tap();

    await expect(page).toHaveURL(/\/baseball\/league\/91/, { timeout: 15000 });
    await leaguePage.formErrorCard.expectHidden();
  });
});

// ── regression: rate limiting on join attempts (LS-2119) ──────────

test.describe('Join League — rate limiting @regression', () => {
  test('surfaces the rate-limit message without crashing the form', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueErrorResponse(
        'Too many attempts. Please try again later.',
        'RATE_LIMITED',
      ),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Rate Limited Team');

    await leaguePage.formErrorCard
      .filterByText(/too many attempts/i)
      .expectVisible();

    // Stays on the join page and remains usable (button re-enabled) rather
    // than crashing or getting stuck in a loading state.
    await expect(page).toHaveURL('/baseball/league/join');
    await leaguePage.joinButton.expectEnabled();
  });
});

// ── regression: error message specificity (LS-2119) ──────────────
//
// A joinLeagueByCode failure always renders through the same inline error
// card (JoinLeagueByCodePage.tsx passes `error.message` straight through —
// it never branches on the GraphQL error code to pick a surface); the
// dedicated orange "This league is full" banner is driven exclusively by
// the earlier validateInviteCode preview (`leagueInfo.isFull`), already
// covered by the "Join League — invite code validation" describe block
// above. What these tests lock in is message *specificity*: three distinct
// join-time failures must produce three distinct, non-overlapping messages
// in that one card, so a user never mistakes a full league for the
// "already a member" case, or either for a generic server error.

test.describe('Join League — error message specificity @regression', () => {
  test('shows the "already a member" message for a BAD_USER_INPUT duplicate-join error', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueErrorResponse(
        'You are already in this league',
        'BAD_USER_INPUT',
      ),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Member Team');

    await leaguePage.formErrorCard
      .filterByText(/already in this league/i)
      .expectVisible();
    await leaguePage.formErrorCard
      .filterByText(/league is (now )?full/i)
      .expectHidden();
  });

  test('shows a "league is full" message when the last spot is claimed at submit time', async ({
    page,
    leaguePage,
  }) => {
    // Simulates a race: the preview said spots were open, but another user
    // claimed the last one before this join mutation landed.
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        availableSpots: 1,
        isFull: false,
      }),
      joinleaguebycode: joinLeagueErrorResponse(
        'This league is now full',
        'BAD_USER_INPUT',
      ),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Latecomer Team');

    await leaguePage.formErrorCard
      .filterByText(/league is now full/i)
      .expectVisible();
    await leaguePage.formErrorCard
      .filterByText(/already in this league/i)
      .expectHidden();
  });

  test('shows a generic message for an unrecognized server error', async ({
    page,
    leaguePage,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueErrorResponse(
        'Internal server error. Please try again later.',
        'INTERNAL_SERVER_ERROR',
      ),
    });

    await leaguePage.gotoJoin();
    await leaguePage.expectJoinFormVisible();

    await leaguePage.fillAndSubmitJoinForm('VALIDCO1', 'Server Error Team');

    await leaguePage.formErrorCard
      .filterByText(/internal server error/i)
      .expectVisible();
    await leaguePage.formErrorCard
      .filterByText(/already in this league/i)
      .expectHidden();
    await leaguePage.formErrorCard
      .filterByText(/league is (now )?full/i)
      .expectHidden();
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
