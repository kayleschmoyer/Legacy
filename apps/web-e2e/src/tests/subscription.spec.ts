/**
 * E2E tests for subscription flows.
 *
 * Covers:
 * - PremiumGate component: free users see blurred content + lock overlay
 * - PremiumGate component: premium users see content unblurred
 * - Upgrade CTA in PremiumGate lock overlay opens UpgradeModal
 * - UpgradeModal lists premium features and links to pricing
 * - SubscriptionPage (/profile/subscription): renders for free tier
 * - SubscriptionPage (/profile/subscription): renders for active premium tier
 * - SubscriptionPage (/profile/subscription): shows past-due banner
 * - SubscriptionPage (/profile/subscription): shows canceled state
 * - Upgrade flow: guard fires when GetStripePrices returns null
 * - Upgrade flow: createCheckoutSession called when price IDs are available
 */

import { createCustomAuthTest, expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import {
  createBillingPortalSessionResponse,
  createCheckoutSessionResponse,
  myCanceledSubscriptionResponse,
  myFreeSubscriptionResponse,
  myPastDueSubscriptionResponse,
  myPremiumSubscriptionResponse,
} from '../mocks/graphql/subscription.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches the app's GraphQL endpoint but not source-file imports. */
type GraphQLHandlers = Record<string, unknown>;

/**
 * Route GraphQL operations to controlled response bodies.
 *
 * Keys are FULL GraphQL operation names, compared case-insensitively for exact
 * equality against the extracted operation name (LS-9794/LS-9866) — a substring
 * test on the raw POST body can match more than one operation and fulfill the
 * route with the wrong response shape.
 */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: GraphQLHandlers,
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

/** Seed a fresh step-up token so the StepUpModal is bypassed in billing tests. */
async function seedStepUp(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    sessionStorage.setItem(
      'ls_step_up_until',
      String(Math.floor(Date.now() / 1000) + 900),
    );
  });
}

// ---------------------------------------------------------------------------
// PremiumGate — Player Comparison page (known usage of PremiumGate)
// ---------------------------------------------------------------------------

// useIsPremiumStatus short-circuits to true for admin users, so these tests
// must run as a non-admin free user to exercise the gated UI path.
const freeUserTest = createCustomAuthTest('free@test.com', 'none');

// The shared-mocks `getuserbyid` baseline is premium (LS-5030) and useIsPremium()
// sources premium status from GetUserById (not the JWT), so a free-gate test must
// pin the free tier via the shared `useTier(page, 'free')` fixture (LS-8058)
// before navigating or the gate never renders.

test.describe('PremiumGate — free user @critical', () => {
  freeUserTest(
    'free user sees the inline Upgrade button in PremiumBanner (LS-7012)',
    async ({ page }) => {
      // Return no subscription (free tier) so the page renders in free mode.
      await routeGraphQL(page, {
        getmysubscription: myFreeSubscriptionResponse(),
        // Minimal player comparison stubs so the page shell renders
        getplayerswithstats: {
          data: { players: { nodes: [], totalCount: 0 } },
        },
      });
      await useTier(page, 'free');

      await page.goto('/players/compare');
      await page.waitForLoadState('load');

      // LS-7012: PremiumGate overlay removed. Free users see the inline
      // PremiumBanner whose CTA has aria-label="Upgrade".
      const upgradeBtn = page.getByRole('button', { name: 'Upgrade' });
      await expect(upgradeBtn).toBeVisible();
    },
  );

  freeUserTest(
    'clicking Upgrade CTA opens the UpgradeModal',
    async ({ page }) => {
      await routeGraphQL(page, {
        getmysubscription: myFreeSubscriptionResponse(),
        getplayerswithstats: {
          data: { players: { nodes: [], totalCount: 0 } },
        },
      });
      await useTier(page, 'free');

      await page.goto('/players/compare');
      await page.waitForLoadState('load');

      // LS-7012: Click the PremiumBanner's inline "Upgrade" CTA (aria-label).
      await page.getByRole('button', { name: 'Upgrade' }).click();

      // UpgradeModal should be visible — check for the modal title heading
      await expect(
        page.getByRole('heading', { name: /upgrade to premium/i }),
      ).toBeVisible();
    },
  );

  freeUserTest(
    'clicking Get Premium in UpgradeModal navigates to /pricing @critical',
    async ({ page }) => {
      await routeGraphQL(page, {
        getmysubscription: myFreeSubscriptionResponse(),
        getplayerswithstats: {
          data: { players: { nodes: [], totalCount: 0 } },
        },
        getstripeprices: {
          data: {
            stripePrices: {
              monthlyPriceCents: 499,
              annualTotalCents: 3999,
              monthlyPriceId: 'price_monthly_test',
              annualPriceId: 'price_annual_test',
            },
          },
        },
      });
      await useTier(page, 'free');

      await page.goto('/players/compare');
      await page.waitForLoadState('load');

      // LS-7012: Open the UpgradeModal via the PremiumBanner inline CTA.
      await page.getByRole('button', { name: 'Upgrade' }).click();
      await expect(
        page.getByRole('heading', { name: /upgrade to premium/i }),
      ).toBeVisible();

      // Clicking "Get Premium" should close the modal and navigate to /pricing
      await page.getByRole('button', { name: /get premium/i }).click();
      await expect(page).toHaveURL(/\/pricing/);
    },
  );
});

test.describe('PremiumGate — premium user @critical', () => {
  test('premium user sees unblurred content without lock overlay', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myPremiumSubscriptionResponse(),
      getplayerswithstats: { data: { players: { nodes: [], totalCount: 0 } } },
    });

    await page.goto('/players/compare');
    await page.waitForLoadState('load');

    // No lock/upgrade overlay
    await expect(
      page.getByRole('button', { name: /upgrade/i }),
    ).not.toBeVisible();

    // LS-7032: the redundant inline premium banner (the "Premium · Player
    // Comparison" note with the "Subscribed" pill) must NOT render for premium
    // subscribers — it is dismissed entirely, not just disabled.
    await expect(
      page.getByText('Premium · Player Comparison'),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// SubscriptionPage — /profile/subscription
// ---------------------------------------------------------------------------

test.describe('SubscriptionPage — free tier @regression', () => {
  test('renders heading and shows upgrade options for free users', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myFreeSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /subscription|billing/i }),
    ).toBeVisible();

    // Should show a CTA to upgrade
    await expect(
      page.getByRole('button', { name: /upgrade|get premium/i }),
    ).toBeVisible();
  });

  test('shows free tier feature list items', async ({ page }) => {
    await routeGraphQL(page, {
      getmysubscription: myFreeSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    // The feature comparison table lists "Join up to 3 leagues"
    await expect(page.getByText(/3 league|up to 3/i)).toBeVisible();
  });
});

test.describe('SubscriptionPage — active premium @regression', () => {
  test('renders current plan details for premium users', async ({ page }) => {
    await routeGraphQL(page, {
      getmysubscription: myPremiumSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    // Should show active plan indicator
    await expect(page.getByText(/active|premium/i).first()).toBeVisible();

    // Manage billing / portal button
    await expect(
      page
        .getByRole('button', {
          name: /manage billing|billing portal|cancel|manage/i,
        })
        .first(),
    ).toBeVisible();
  });

  test('billing portal button calls createBillingPortalSession mutation', async ({
    page,
  }) => {
    let billingMutationCalled = false;
    await routeGraphQL(page, {
      getmysubscription: myPremiumSubscriptionResponse(),
    });

    // Mock the portal session mutation — flag is only set when the request actually fires
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'createbillingportalsession') {
        billingMutationCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createBillingPortalSessionResponse()),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');
    await seedStepUp(page);

    const manageBtn = page
      .getByRole('button', { name: /manage billing|billing portal|manage/i })
      .first();
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    await expect.poll(() => billingMutationCalled).toBe(true);
  });
});

test.describe('SubscriptionPage — past due @regression', () => {
  test('shows past-due warning banner for past_due status', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myPastDueSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    await expect(
      page.getByText(/past due|payment failed|fix payment/i).first(),
    ).toBeVisible();
  });
});

test.describe('SubscriptionPage — canceled @regression', () => {
  test('shows resubscribe option when subscription is canceled', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myCanceledSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    // The subscription card renders the tier badge with `data-status` set to
    // the current subscription status.
    await expect(
      page.locator(
        '[data-testid="subscription-tier-badge"][data-status="canceled"]',
      ),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Upgrade flow — checkout mutation
// ---------------------------------------------------------------------------

test.describe('Subscription upgrade flow @critical', () => {
  // With price IDs now fetched from the backend via the GetStripePrices query
  // (LS-3102), the client-side guard triggers when the query returns null
  // (e.g. Stripe is not configured on the server), not when env vars are missing.

  test('upgrade button calls createCheckoutSession when GetStripePrices returns price IDs', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'getmysubscription') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFreeSubscriptionResponse()),
        });
        return;
      }
      if (operation === 'getstripeprices') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              stripePrices: {
                monthlyPriceCents: 499,
                annualTotalCents: 3999,
                monthlyPriceId: 'price_monthly_test',
                annualPriceId: 'price_annual_test',
              },
            },
          }),
        });
        return;
      }
      if (operation === 'createcheckoutsession') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createCheckoutSessionResponse()),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    // Register both waiters BEFORE navigating so we don't miss the responses.
    // stripePricesDone resolves once we've confirmed actual price IDs landed in
    // the browser — this guarantees they're in the Apollo cache before we click.
    const stripePricesDone = page.waitForResponse(async (response) => {
      if (!isGraphQLEndpoint(new URL(response.url()))) return false;
      const body: unknown = await response.json().catch(() => null);
      return (
        typeof body === 'object' &&
        body !== null &&
        'data' in body &&
        typeof body.data === 'object' &&
        body.data !== null &&
        'stripePrices' in body.data &&
        body.data.stripePrices != null
      );
    });
    // checkoutSent resolves as soon as the browser fires the mutation — no
    // polling needed and no risk of missing the request.
    const checkoutSent = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(new URL(req.url())) &&
        (req.postData()?.toLowerCase() ?? '').includes('createcheckoutsession'),
      { timeout: 10_000 },
    );

    await page.goto('/profile/subscription');
    await stripePricesDone;
    await seedStepUp(page);

    await page
      .getByRole('button', { name: /upgrade|get premium/i })
      .first()
      .click();

    // Verify createCheckoutSession was called with the correct price ID.
    const checkoutRequest = await checkoutSent;
    expect(checkoutRequest.postData()).toContain('price_annual_test');
  });

  test('upgrade button shows unavailable banner when GetStripePrices returns null', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route);
      if (op === 'GetMySubscription') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFreeSubscriptionResponse()),
        });
        return;
      }
      // Return null for stripePrices to trigger the guard.
      if (op === 'GetStripePrices') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { stripePrices: null } }),
        });
        return;
      }
      // createCheckoutSession should NOT be called when the guard fires.
      if (op === 'CreateCheckoutSession') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createCheckoutSessionResponse()),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');
    await seedStepUp(page);

    const upgradeBtn = page
      .getByRole('button', { name: /upgrade|get premium/i })
      .first();
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    // LS-4062 replaced window.alert() with an inline error banner — check the DOM.
    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
  });

  test('upgrade button shows error banner when createCheckoutSession fails', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route);
      if (op === 'GetMySubscription') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFreeSubscriptionResponse()),
        });
        return;
      }
      if (op === 'GetStripePrices') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              stripePrices: {
                monthlyPriceCents: 499,
                annualTotalCents: 3999,
                monthlyPriceId: 'price_monthly_test',
                annualPriceId: 'price_annual_test',
              },
            },
          }),
        });
        return;
      }
      if (op === 'CreateCheckoutSession') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Stripe is down' }],
          }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');
    await seedStepUp(page);

    const upgradeBtn = page
      .getByRole('button', { name: /upgrade|get premium/i })
      .first();
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    // LS-4062 replaced window.alert() with an inline error banner — check the DOM.
    await expect(page.getByText(/could not start checkout/i)).toBeVisible();
    // Button should be re-enabled after the error so the user can retry.
    await expect(upgradeBtn).toBeEnabled();
  });
});
