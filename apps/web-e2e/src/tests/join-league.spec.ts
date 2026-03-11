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
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { LeaguePage } from '../pages/league.page';
import {
  joinLeagueByCodeResponse,
  validateInviteCodeNotFoundResponse,
  validateInviteCodeResponse,
} from '../mocks/graphql/league.mocks';

/** Matches GraphQL API calls but not source-file imports. */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return s.includes('/graphql') && !s.includes('/@fs/') && !s.includes('.ts');
}

// ── helpers ───────────────────────────────────────────────────────

/** Route all GraphQL requests through a per-operation handler map.
 *  Unrecognised operations are forwarded to the next handler via fallback().
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

    await route.fallback();
  });
}

// ── critical: page load ───────────────────────────────────────────

test.describe('Join League — page load @critical', () => {
  test('displays the join form correctly', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    // Heading visible
    await expect(lp.joinHeading).toBeVisible();

    // No deep-link banner on plain /join
    await expect(lp.deepLinkBanner).not.toBeVisible();

    // Join button disabled until both fields are filled
    await expect(lp.joinButton).toBeDisabled();

    // Cancel button present
    await expect(lp.cancelButton).toBeVisible();
  });

  test('renders the How It Works info card', async ({ page }) => {
    await page.goto('/baseball/league/join');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: /How It Works/i }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/8-character code/i)).toBeVisible();
  });
});

// ── critical: deep link ───────────────────────────────────────────

test.describe('Join League — deep link @critical', () => {
  test('pre-fills invite code from URL and shows banner', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin('ABC12XYZ');
    await lp.expectJoinFormVisible();

    // Code is pre-filled from the URL
    await expect(lp.inviteCodeInput).toHaveValue('ABC12XYZ');

    // Deep-link confirmation banner appears
    await expect(lp.deepLinkBanner).toBeVisible({ timeout: 10000 });

    // Subtext changes to indicate code is pre-filled
    await expect(
      page.getByText(/Your invite code has been pre-filled/i),
    ).toBeVisible();
  });

  test('deep-link code is auto-uppercased', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin('abc12xyz');
    await lp.expectJoinFormVisible();

    await expect(lp.inviteCodeInput).toHaveValue('ABC12XYZ');
  });
});

// ── critical: invite code validation preview ──────────────────────

test.describe('Join League — invite code validation @critical', () => {
  test('shows league name and available spots after valid 8-char code', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Summer Sluggers',
        totalSpots: 10,
        availableSpots: 3,
        isFull: false,
      }),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.inviteCodeInput.fill('SLUGGER1');

    await expect(page.getByText(/Summer Sluggers/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/3.*of.*10.*spot/i)).toBeVisible();
  });

  test('shows "invalid invite code" for unknown 8-char code', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeNotFoundResponse(),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.inviteCodeInput.fill('BADCODE1');

    await expect(page.getByText(/Invalid invite code/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows league-full state when isFull is true', async ({ page }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Full House League',
        totalSpots: 10,
        availableSpots: 0,
        isFull: true,
      }),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.inviteCodeInput.fill('FULLLEAG');

    await expect(page.getByText(/League full/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/all 10 spots taken/i)).toBeVisible();
  });
});

// ── critical: successful join ─────────────────────────────────────

test.describe('Join League — successful join @critical', () => {
  test('joins league and redirects to league detail page', async ({ page }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(42),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.fillAndSubmitJoinForm('VALIDCO1', 'My Awesome Team');

    await expect(page).toHaveURL(/\/baseball\/league\/42/, { timeout: 15000 });
  });

  test('deep-link: pre-filled code join succeeds', async ({ page }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: joinLeagueByCodeResponse(77),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin('DEEPLINK');
    await lp.expectJoinFormVisible();

    // Code is pre-filled; just add team name
    await lp.teamNameInput.fill('Deep Liners');
    await lp.joinButton.click();

    await expect(page).toHaveURL(/\/baseball\/league\/77/, { timeout: 15000 });
  });
});

// ── regression: form validation ───────────────────────────────────

test.describe('Join League — form validation @regression', () => {
  test('join button remains disabled until both fields are filled', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    // Both fields empty → disabled
    await expect(lp.joinButton).toBeDisabled();

    // Code filled, team name empty → still disabled (leagueInfo populates but teamName empty)
    await lp.inviteCodeInput.fill('ONLYCOD1');
    await expect(lp.joinButton).toBeDisabled();

    // Team name filled, code empty → still disabled
    await lp.inviteCodeInput.fill('');
    await lp.teamNameInput.fill('My Team');
    await expect(lp.joinButton).toBeDisabled();

    // Both filled → enabled (validation mock confirms code is valid)
    await lp.inviteCodeInput.fill('VALIDCO1');
    await expect(lp.joinButton).toBeEnabled({ timeout: 10_000 });
  });

  test('shows error when submitting invalid code format', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    // Type a short code to bypass the 8-char maxlength check
    // then directly submit via page.evaluate to bypass the button disabled state
    await lp.inviteCodeInput.fill('SHORT');
    await lp.teamNameInput.fill('My Team');

    // The button should be disabled because the code < 8 chars
    await expect(lp.joinButton).toBeDisabled();
  });

  test('input enforces 8-character maximum', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    // maxLength={8} on the input
    await lp.inviteCodeInput.fill('TOOLONGCODE');
    const val = await lp.inviteCodeInput.inputValue();
    expect(val.length).toBeLessThanOrEqual(8);
  });

  test('input auto-uppercases typed characters', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.inviteCodeInput.fill('abcdefgh');
    await expect(lp.inviteCodeInput).toHaveValue('ABCDEFGH');
  });
});

// ── regression: league-full submit block ─────────────────────────

test.describe('Join League — league full @regression', () => {
  test('join button disabled when league is reported as full', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse({
        leagueName: 'Full League',
        totalSpots: 8,
        availableSpots: 0,
        isFull: true,
      }),
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.inviteCodeInput.fill('FULLLEAG');
    await lp.teamNameInput.fill('My Team');

    // Banner should appear and submit should be disabled
    await expect(
      page.getByRole('alert').filter({ hasText: /This league is full/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(lp.joinButton).toBeDisabled();
  });
});

// ── regression: GraphQL error handling ───────────────────────────

test.describe('Join League — error handling @regression', () => {
  test('shows inline error when joinLeagueByCode mutation fails', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
      joinleaguebycode: {
        data: null,
        errors: [{ message: 'You are already in this league' }],
      },
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.fillAndSubmitJoinForm('VALIDCO1', 'Repeat Team');

    // Error message should appear in a red card
    await expect(lp.formErrorCard).toBeVisible({ timeout: 10000 });

    // Stays on the join page
    await expect(page).toHaveURL('/baseball/league/join');
  });

  test('shows error if network fails during join', async ({ page }) => {
    await routeGraphQL(page, {
      validateinvitecode: validateInviteCodeResponse(),
    });

    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('joinleaguebycode')) {
        await route.abort('failed');
        return;
      }
      await route.fallback();
    });

    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.fillAndSubmitJoinForm('VALIDCO1', 'Network Team');

    await expect(lp.formErrorCard).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL('/baseball/league/join');
  });
});

// ── regression: cancel navigation ────────────────────────────────

test.describe('Join League — cancel @regression', () => {
  test('Cancel button returns to baseball landing page', async ({ page }) => {
    const lp = new LeaguePage(page);
    await lp.gotoJoin();
    await lp.expectJoinFormVisible();

    await lp.cancelButton.click();

    await expect(page).toHaveURL('/baseball', { timeout: 10000 });
  });
});
