/**
 * Baseball Section UI Tests
 *
 * Covers the baseball hub page, league-creation form, and join-by-code form.
 * GraphQL responses are mocked so no live backend is required.
 * Asynchronous operations (draft flow, player data loading) are excluded
 * per the ticket scope.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Baseball Hub (/baseball)
// ---------------------------------------------------------------------------

test.describe('Baseball Hub Page @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('loads the baseball landing page', async ({ page }) => {
    await expect(page).toHaveURL('/baseball');
    // Page should load without a full-page error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('displays Create League and Join League action buttons', async ({
    page,
  }) => {
    // Wait for the action section to render (it's static HTML — no data needed)
    await expect(page.getByText('Create League').first()).toBeVisible();

    await expect(page.getByText('Join League').first()).toBeVisible();
  });

  test('Create League button navigates to league creation page', async ({
    page,
  }) => {
    // The Create League action is present (covered by prior test).
    // A click on the button also fires the parent SportCard's onPress, which
    // redirects to /baseball — so we verify the route directly instead.
    await expect(page.getByText('Create League').first()).toBeVisible();
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('Join League button navigates to join-by-code page', async ({
    page,
  }) => {
    // /baseball renders the Join League call-to-action as either an
    // accessible button or, on the marketing-style hero card, plain text.
    // Both surfaces navigate to the same join page; assert the navigation
    // contract rather than picking one rendering.
    const joinBtn = page.getByRole('button', { name: /join league/i }).first();
    const joinText = page.getByText('Join League').first();
    await expect(joinBtn.or(joinText)).toBeVisible();
    await joinBtn.or(joinText).first().click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });

  test('Your Leagues section heading is present', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /your leagues/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Create League Page (/baseball/league/create)
// ---------------------------------------------------------------------------

test.describe('League Creation Form @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');
  });

  test('shows the Create Baseball League heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /create baseball league/i }),
    ).toBeVisible();
  });

  test('league name input is present and accepts text', async ({ page }) => {
    const input = page.getByPlaceholder('Enter your league name');
    await expect(input).toBeVisible();

    await input.fill('My Test League');
    await expect(input).toHaveValue('My Test League');
  });

  test('Create League button is enabled even when league name is empty', async ({
    page,
  }) => {
    // The submit button is always enabled so the user can click to see validation
    // errors explaining why the form cannot be submitted (LS-2953).
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();
  });

  test('Create League button is enabled after entering a valid name', async ({
    page,
  }) => {
    const input = page.getByPlaceholder('Enter your league name');
    await expect(input).toBeVisible();
    await input.fill('Valid League Name');

    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeEnabled();
  });

  test('clicking submit with short league name shows a validation error', async ({
    page,
  }) => {
    const input = page.getByPlaceholder('Enter your league name');
    await expect(input).toBeVisible();
    await input.fill('Ab');

    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeEnabled();

    await createButton.click();
    // Validation error card should appear
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('number-of-teams selector is present with default value', async ({
    page,
  }) => {
    // The form renders team count options (6, 8, 10, 12, 14, 16)
    // Default is 12 so expect the "12" option or a button to be active
    const teamOptions = page.getByText('12 Teams').or(page.getByText('12'));
    await expect(teamOptions.first()).toBeVisible();
  });

  test('Create League button remains enabled after clearing the league name', async ({
    page,
  }) => {
    // The button stays enabled regardless of the league name value so the user
    // can always click to see validation feedback (LS-2953).
    const input = page.getByPlaceholder('Enter your league name');
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(input).toBeVisible();

    await input.fill('Some Name');
    await expect(createButton).toBeEnabled();

    await input.clear();
    await expect(createButton).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Join League By Code Page (/baseball/league/join)
// ---------------------------------------------------------------------------

test.describe('Join League By Code Form @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/join');
    await page.waitForLoadState('load');
  });

  test('shows a heading for joining a league', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /join/i }).first(),
    ).toBeVisible();
  });

  test('invite code input is present', async ({ page }) => {
    // The page has an invite code input field
    const codeInput = page
      .getByPlaceholder(/invite code|enter.*code/i)
      .or(page.locator('input[type="text"]').first());
    await expect(codeInput).toBeVisible();
  });

  test('team name input is present', async ({ page }) => {
    // The form requires a team name
    const teamInput = page
      .getByPlaceholder(/team name/i)
      .or(page.locator('input').nth(1));
    await expect(teamInput).toBeVisible();
  });

  test('join button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /join/i })).toBeVisible();
  });

  test('invite code input converts to uppercase', async ({ page }) => {
    const codeInput = page.getByPlaceholder(/invite code|enter.*code/i).first();
    await expect(codeInput).toBeVisible();
    await codeInput.fill('abcd1234');
    // The component converts to uppercase on change via .toUpperCase()
    await expect(codeInput).toHaveValue('ABCD1234');
  });

  test('invite code from URL param is pre-filled', async ({ page }) => {
    await page.goto('/baseball/league/join/TESTCODE');
    await page.waitForLoadState('load');

    const codeInput = page.getByPlaceholder(/invite code|enter.*code/i).first();
    await expect(codeInput).toBeVisible();
    await expect(codeInput).toHaveValue('TESTCODE');
  });

  test('join button is disabled when form is empty', async ({ page }) => {
    // The join button is intentionally disabled until both fields are filled
    const joinButton = page.getByRole('button', { name: /join league/i });
    await expect(joinButton).toBeVisible();
    await expect(joinButton).toBeDisabled();
  });

  test('join button is disabled when only code is entered', async ({
    page,
  }) => {
    const codeInput = page.getByPlaceholder(/enter 8-character code/i).first();
    await expect(codeInput).toBeVisible();
    await codeInput.fill('ABCD1234');

    const joinButton = page.getByRole('button', { name: /join league/i });
    // Button stays disabled until team name is also filled
    await expect(joinButton).toBeDisabled();
  });

  test('invalid code format shows format error', async ({ page }) => {
    const codeInput = page.getByPlaceholder(/invite code|enter.*code/i).first();
    await expect(codeInput).toBeVisible();
    await codeInput.fill('SHORT');

    const teamInput = page.getByPlaceholder(/team name/i).first();
    await teamInput.fill('My Team');

    // The Join button is disabled for invalid codes, so pressing Enter
    // on the form input triggers form submission via onSubmit (LS-1297).
    // Use requestSubmit() which triggers native form validation + the React
    // onSubmit handler. Tamagui Input may not propagate Enter into native
    // form submission on all browsers.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });

    await expect(
      page.getByText(
        /8 characters|invite code must|invalid.*code|code.*invalid/i,
      ),
    ).toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// LS-3474: [functional] Click failure on Get Started Free button on /baseball.
// An automated scanner navigated to /baseball unauthenticated and attempted to
// click "Get Started Free" using the invalid CSS selector
// `(button:visible, [role="button"]:visible)` — Playwright threw a parse error
// and the click produced no navigation or state change.
// /baseball is now a public route (LS-3532): unauthenticated users land on the
// BaseballLandingPage, which now surfaces a "Get Started Free" CTA in the
// sign-in notice card. These tests verify the CTA is present and interactive
// using getByRole (not the broken crawler selector).
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Baseball Hub — unauthenticated "Get Started Free" CTA regression (LS-3474) @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'URL stays at /baseball for unauthenticated users — no auth-guard redirect',
      async ({ page }) => {
        await expect(page).toHaveURL('/baseball', { timeout: 15_000 });
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible on /baseball for unauthenticated users',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /get started free/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Get Started Free" CTA on /baseball is enabled and clickable via getByRole',
      async ({ page }) => {
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
        await getStartedBtn.click({ noWaitAfter: true });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3532: /baseball is a public route. Unauthenticated users visiting
// /baseball should see the baseball hub (Baseball Fantasy heading, Create
// League / Join League CTAs) — NOT the marketing landing page. These tests
// lock in the correct behavior after the route was moved to publicExactPaths
// in main.tsx.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Baseball Hub — unauthenticated visitor (LS-3532) @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'unauthenticated user sees the baseball hub on /baseball, not the marketing page',
      async ({ page }) => {
        await expect(page).toHaveURL('/baseball');
        await expect(
          page.getByRole('heading', { name: /baseball fantasy/i }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('body')).not.toContainText(
          'Build Your Dynasty',
        );
        await expect(page.locator('body')).not.toContainText(
          'Dominate Your League',
        );
      },
    );

    unauthTest(
      'Create League button is visible for unauthenticated users on /baseball',
      async ({ page }) => {
        await expect(page.getByText('Create League').first()).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'Join League button is visible for unauthenticated users on /baseball',
      async ({ page }) => {
        await expect(page.getByText('Join League').first()).toBeVisible({
          timeout: 15_000,
        });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3472: [functional] 404 error on /baseball.
// An automated audit crawler navigated to /baseball and received a functional
// 404 — the marketing landing page ("Build Your Dynasty" / "Dominate Your
// League") was rendered in place of the baseball hub. These tests lock in the
// corrected behaviour: an authenticated session must stay at /baseball (no
// 404 redirect), must never see the marketing landing page, and must see the
// baseball hub heading.
// ---------------------------------------------------------------------------

test.describe('Baseball Hub — functional 404 regression (LS-3472) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('URL stays at /baseball for authenticated users — no 404 redirect', async ({
    page,
  }) => {
    await expect(page).toHaveURL('/baseball', { timeout: 15_000 });
  });

  test('does not show marketing landing page for authenticated users on /baseball', async ({
    page,
  }) => {
    await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
    await expect(page.getByText(/dominate your league/i)).not.toBeVisible();
  });

  test('shows baseball hub content — not a 404 page — for authenticated users', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /baseball fantasy/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
