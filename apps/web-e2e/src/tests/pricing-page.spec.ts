/**
 * E2E tests for the Pricing page (/pricing).
 *
 * Covers:
 * - Page load: heading, billing toggle, plan cards
 * - Default state: annual toggle active, premium price shown
 * - Billing toggle: switching monthly / annual updates price display
 * - Free plan card: $0, "Get Started Free" button visible
 * - Premium plan card: "Upgrade to Premium" button, "Most Popular" badge
 * - Feature comparison table: "Compare plans" heading, key rows present
 * - FAQ section: heading visible
 * - No GraphQL calls needed (pricing page is fully static)
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

test.describe('Pricing page – page load @regression', () => {
  test('renders page heading and billing toggle', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Hero heading
    await expect(
      page.getByRole('heading', { name: /the plan that fits/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Billing cycle toggle
    await expect(page.getByText(/monthly/i).first()).toBeVisible();
    await expect(page.getByText(/annual/i).first()).toBeVisible();
  });

  test('shows Free and Premium plan cards', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Free plan
    await expect(page.getByText('FREE').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('$0')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /get started free/i }).first(),
    ).toBeVisible();

    // Premium plan
    await expect(page.getByText('PREMIUM').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /upgrade to premium/i }).first(),
    ).toBeVisible();
  });

  test('shows "Most Popular" badge on premium plan', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/most popular/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Pricing page — billing toggle @regression', () => {
  test('switches between monthly and annual pricing', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // The page defaults to annual. Click "Monthly" toggle.
    const monthlyToggle = page.getByText(/^monthly$/i).first();
    await monthlyToggle.click();

    // After switching to monthly the price display changes
    // Monthly price: $4.99; Annual monthly equivalent: $3.33
    await expect(page.getByText('4.99')).toBeVisible({ timeout: 5_000 });

    // Switch back to annual
    const annualToggle = page.getByText(/^annual$/i).first();
    await annualToggle.click();

    await expect(page.getByText('3.33')).toBeVisible({ timeout: 5_000 });
  });

  test('"Save 30%" discount badge is visible on annual toggle option', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/save \d+%/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Pricing page — feature comparison @smoke', () => {
  test('displays "Compare plans" section heading', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/compare plans/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('comparison table has Free and Premium column headers', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/^free$/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/^premium$/i).first()).toBeVisible();
  });

  test('comparison table rows include leagues and mock drafts', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // Key comparison rows from COMPARISON_ROWS constant
    await expect(page.getByText(/leagues/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/mock drafts/i).first()).toBeVisible();
    await expect(page.getByText(/unlimited/i).first()).toBeVisible();
  });
});

test.describe('Pricing page — FAQ section @regression', () => {
  test('FAQ section heading is visible', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    await expect(page.getByText(/frequently asked|faq/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('FAQ items exist and are expandable', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('load');

    // First FAQ item (index 0) from FAQ_ITEMS constant: "Can I try Premium…"
    const firstFaq = page.getByTestId('pricing-faq-item-0');
    await expect(firstFaq).toBeVisible({ timeout: 10_000 });
    await expect(firstFaq).toHaveAttribute('data-open', 'false');

    // Click to expand; the item flips data-open="true".
    await firstFaq.click();
    await expect(firstFaq).toHaveAttribute('data-open', 'true', {
      timeout: 3_000,
    });
  });
});

// ---------------------------------------------------------------------------
// LS-3515: /pricing is a public route. Unauthenticated users must see the
// pricing content — not the "Build Your Dynasty" landing page rendered by
// EnhancedAuthGuard for protected routes. An automated audit crawler visited
// https://legacy-fantasy.com/pricing unauthenticated, received the GitHub Pages
// 404 response (expected for SPA routes), then saw the marketing landing page
// after the 404.html redirect loaded the SPA — and mis-reported it as a
// functional 404. The route is correctly listed in publicPaths; these tests
// lock in the unauthenticated rendering so a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Pricing page — unauthenticated visitor @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows pricing heading on /pricing when not authenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /the plan that fits/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show the marketing landing page on /pricing when not authenticated',
      async ({ page }) => {
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
      },
    );

    unauthTest(
      'shows Free plan card on /pricing when not authenticated',
      async ({ page }) => {
        await expect(page.getByText('FREE').first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText('$0')).toBeVisible();
      },
    );

    unauthTest(
      '"Get Started Free" button is visible and navigates to / on /pricing when not authenticated',
      async ({ page }) => {
        const btn = page
          .getByRole('button', { name: /get started free/i })
          .first();
        await expect(btn).toBeVisible({ timeout: 15_000 });
        await btn.click();
        await expect(page).toHaveURL('/');
      },
    );
  },
);

// LS-3562: /faq is a common alias that users and crawlers reach.
// It must redirect to /pricing (which contains the FAQ accordion + CTA buttons)
// so that "Get Started Free" is always reachable via a valid route.
test.describe('/faq redirect @regression', () => {
  test('redirects /faq to /pricing', async ({ page }) => {
    await page.goto('/faq');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/pricing/);
  });

  test('"Get Started Free" button is visible after /faq redirect', async ({
    page,
  }) => {
    await page.goto('/faq');
    // Wait for the client-side redirect to complete before asserting on
    // page content — avoids a race between React Router's <Navigate> and
    // the element check.
    await page.waitForURL(/\/pricing/, { timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /get started free/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"Get Started Free" button is clickable after /faq redirect', async ({
    page,
  }) => {
    await page.goto('/faq');
    // Wait for the client-side redirect to complete before interacting.
    await page.waitForURL(/\/pricing/, { timeout: 10_000 });

    const btn = page.getByRole('button', { name: /get started free/i }).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    // The button navigates to / — confirm the URL change so we know the click
    // worked and the navigation settles before teardown.
    await page.waitForURL('/');
  });
});

// LS-3561: /pricing must be accessible without authentication so that
// unauthenticated users (and crawlers) reaching /faq see the pricing/FAQ
// content instead of the auth gate.
unauthTest.describe('/pricing — unauthenticated access @regression', () => {
  unauthTest(
    'shows pricing page content on /pricing without authentication',
    async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  unauthTest(
    '"Get Started Free" button is visible on /pricing without authentication',
    async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /get started free/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    },
  );

  unauthTest(
    'redirects /faq to /pricing without authentication',
    async ({ page }) => {
      await page.goto('/faq');
      await page.waitForURL(/\/pricing/, { timeout: 10_000 });

      await expect(page).toHaveURL(/\/pricing/);
      await expect(
        page.getByRole('heading', { name: /the plan that fits/i }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );
});

// LS-3517: The functional scanner failed to click "Get Started Free" on /pricing
// using an invalid CSS selector `(button:visible, [role="button"]:visible)` with
// nth=3, targeting the bottom CTA section button. Both "Get Started Free" buttons
// (plan card and bottom CTA) must be reachable via getByRole and navigate correctly.

unauthTest.describe(
  'Pricing page — bottom CTA "Get Started Free" clickable @regression',
  () => {
    unauthTest(
      'bottom CTA "Get Started Free" on /pricing navigates to sign-in (LS-3517)',
      async ({ page }) => {
        await page.goto('/pricing');
        await page.waitForLoadState('load');

        // The lower CTA section has a second "Get Started Free" button — this
        // is the one that nth=3 (from the broken composite selector) was targeting.
        // Use getByRole with .last() to reach it without CSS selector parse errors.
        const bottomBtn = page
          .getByRole('button', { name: /get started free/i })
          .last();
        await expect(bottomBtn).toBeVisible({ timeout: 10_000 });
        await bottomBtn.click();

        // Both "Get Started Free" buttons navigate to /; unauthenticated users
        // see EnhancedAuthGuard → PublicLandingPage with the Google sign-in CTA.
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// LS-3521: Clicking "Get Started Free" on /faq (which redirects to /pricing) must
// navigate unauthenticated users to / where EnhancedAuthGuard shows the sign-in CTA.
// The original functional scan failed with an invalid CSS selector
// `(button:visible, [role="button"]:visible)` — test uses getByRole instead.
unauthTest.describe(
  '/faq — sign-in CTA for unauthenticated users (LS-3521) @regression',
  () => {
    unauthTest(
      '"Get Started Free" on /faq leads to sign-in CTA for unauthenticated users',
      async ({ page }) => {
        await page.goto('/faq');
        // Wait for the client-side redirect from /faq → /pricing.
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        const getStartedBtn = page
          .getByRole('button', { name: /get started free/i })
          .first();
        await expect(getStartedBtn).toBeVisible({ timeout: 10_000 });
        await getStartedBtn.click();

        // EnhancedAuthGuard shows PublicLandingPage for unauthenticated users at /.
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// LS-3520: /faq must display FAQ accordion content (not the marketing homepage)
// for unauthenticated users. The original bug: navigating to /faq showed the
// homepage hero ("Build Your Dynasty. Dominate Your League.") instead of FAQ
// content because the auth gate intercepted before the client-side redirect fired.
unauthTest.describe(
  '/faq — FAQ content visible to unauthenticated users @regression',
  () => {
    unauthTest(
      'shows FAQ section heading after /faq redirect (not homepage content)',
      async ({ page }) => {
        await page.goto('/faq');
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        // FAQ accordion section must be present — confirms FAQ content is shown,
        // not the marketing homepage.
        await expect(page.getByText(/frequently asked|faq/i)).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'shows FAQ accordion items after /faq redirect',
      async ({ page }) => {
        await page.goto('/faq');
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        // At least one FAQ question must be visible — rules out the homepage hero.
        await expect(
          page.getByText(/can i try premium before committing/i),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show homepage hero content at /faq',
      async ({ page }) => {
        await page.goto('/faq');
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        // The marketing homepage hero must NOT appear — this was the original bug.
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible({
          timeout: 5_000,
        });
      },
    );
  },
);

// LS-3559: Clicking "Get Started Free" on /pricing must navigate unauthenticated
// users to / where EnhancedAuthGuard shows PublicLandingPage with the Google
// sign-in CTA. The button must be located via getByRole (accessible name) —
// NOT via the broken `(button:visible, [role="button"]:visible)` CSS selector
// that caused the original failure.
unauthTest.describe(
  'Pricing page — sign-in CTA from /pricing @regression',
  () => {
    unauthTest(
      '"Get Started Free" on /pricing leads to "Continue with Google" sign-in',
      async ({ page }) => {
        await page.goto('/pricing');
        await page.waitForLoadState('load');

        // Click "Get Started Free" — the pricing page navigates to /
        const getStartedBtn = page
          .getByRole('button', { name: /get started free/i })
          .first();
        await expect(getStartedBtn).toBeVisible({ timeout: 10_000 });
        await getStartedBtn.click();

        // EnhancedAuthGuard shows PublicLandingPage for unauthenticated users at /.
        // Locate the Google sign-in CTA by accessible name (not a bare CSS selector).
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3516: /pricing is a public route. Unauthenticated users must see the
// pricing page content — not the "Build Your Dynasty" landing page rendered by
// EnhancedAuthGuard for protected routes. An automated audit crawler visited
// https://legacy-fantasy.com/pricing unauthenticated, received the GitHub Pages
// 404 response (expected for SPA routes), then saw the marketing landing page
// after the 404.html redirect loaded the SPA — and mis-reported it as the
// pricing page showing wrong content. The route is correctly listed in
// publicPaths; these tests lock in the unauthenticated rendering so a
// regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Pricing page — unauthenticated content guard (LS-3516) @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows pricing heading on /pricing when not authenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /the plan that fits/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'does not show the marketing landing page on /pricing when not authenticated',
      async ({ page }) => {
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
      },
    );

    unauthTest(
      'shows Free and Premium plan cards on /pricing when not authenticated',
      async ({ page }) => {
        await expect(page.getByText('FREE').first()).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.getByText('PREMIUM').first()).toBeVisible({
          timeout: 10_000,
        });
      },
    );

    unauthTest(
      '"Get Started Free" button is visible on /pricing when not authenticated',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /get started free/i }).first(),
        ).toBeVisible({ timeout: 10_000 });
      },
    );
  },
);
