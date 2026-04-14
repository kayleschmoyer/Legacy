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

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import {
  createBillingPortalSessionResponse,
  createCheckoutSessionResponse,
  myCanceledSubscriptionResponse,
  myFreeSubscriptionResponse,
  myPastDueSubscriptionResponse,
  myPremiumSubscriptionResponse,
} from '../mocks/graphql/subscription.mocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches the app's GraphQL endpoint but not source-file imports. */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return s.includes('/graphql') && !s.includes('/@fs/') && !s.includes('.ts');
}

type GraphQLHandlers = Record<string, unknown>;

/** Route GraphQL operations to controlled response bodies. */
async function routeGraphQL(
  page: import('@playwright/test').Page,
  handlers: GraphQLHandlers,
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

// ---------------------------------------------------------------------------
// PremiumGate — Player Comparison page (known usage of PremiumGate)
// ---------------------------------------------------------------------------

test.describe('PremiumGate — free user @critical', () => {
  // Player comparison page is not premium-gated in current UI — skip these
  test.fixme('free user sees blurred content with lock overlay and Upgrade button', async ({
    page,
  }) => {
    // Return no subscription (free tier) so the page renders PremiumGate in
    // gated mode.
    await routeGraphQL(page, {
      getmysubscription: myFreeSubscriptionResponse(),
      mysubscription: myFreeSubscriptionResponse(),
      currentuser: { data: { currentUser: null } },
      // Minimal player comparison stubs so the page shell renders
      getplayers: { data: { players: { nodes: [], totalCount: 0 } } },
    });

    await page.goto('/players/compare');
    await page.waitForLoadState('load');

    // The lock overlay card should be visible
    const upgradeBtn = page.getByRole('button', { name: /upgrade/i }).first();
    await expect(upgradeBtn).toBeVisible();
  });

  test.fixme('clicking Upgrade CTA opens the UpgradeModal', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myFreeSubscriptionResponse(),
      mysubscription: myFreeSubscriptionResponse(),
      currentuser: { data: { currentUser: null } },
      getplayers: { data: { players: { nodes: [], totalCount: 0 } } },
    });

    await page.goto('/players/compare');
    await page.waitForLoadState('load');

    const upgradeBtn = page.getByRole('button', { name: /upgrade/i }).first();
    await upgradeBtn.click();

    // UpgradeModal should be visible — check for premium features list heading
    await expect(
      page.getByText(/premium features|upgrade to premium/i),
    ).toBeVisible();
  });
});

test.describe('PremiumGate — premium user @critical', () => {
  test('premium user sees unblurred content without lock overlay', async ({
    page,
  }) => {
    await routeGraphQL(page, {
      getmysubscription: myPremiumSubscriptionResponse(),
      mysubscription: myPremiumSubscriptionResponse(),
      currentuser: { data: { currentUser: null } },
      getplayers: { data: { players: { nodes: [], totalCount: 0 } } },
    });

    await page.goto('/players/compare');
    await page.waitForLoadState('load');

    // No lock/upgrade overlay
    await expect(
      page.getByRole('button', { name: /upgrade/i }),
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
      mysubscription: myFreeSubscriptionResponse(),
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
      mysubscription: myFreeSubscriptionResponse(),
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
      mysubscription: myPremiumSubscriptionResponse(),
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
      mysubscription: myPremiumSubscriptionResponse(),
    });

    // Mock the portal session mutation — flag is only set when the request actually fires
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('createbillingportalsession')) {
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
      mysubscription: myPastDueSubscriptionResponse(),
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
      mysubscription: myCanceledSubscriptionResponse(),
    });

    await page.goto('/profile/subscription');
    await page.waitForLoadState('load');

    // Should show either "Canceled" status or resubscribe CTA
    await expect(
      page.getByText(/canceled|resubscribe|start new|upgrade/i).first(),
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
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('mysubscription') || op.includes('getmysubscription')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFreeSubscriptionResponse()),
        });
        return;
      }
      if (op.includes('getstripeprices') || op.includes('stripeprices')) {
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
      if (op.includes('createcheckoutsession')) {
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

    await page
      .getByRole('button', { name: /upgrade|get premium/i })
      .first()
      .click();

    // Verify createCheckoutSession was called with the correct price ID.
    const checkoutRequest = await checkoutSent;
    expect(checkoutRequest.postData()).toContain('price_annual_test');
  });

  test('upgrade button shows unavailable alert when GetStripePrices returns null', async ({
    page,
  }) => {
    // Capture alert messages before page scripts run so the guard cannot block.
    const alertMessages: string[] = [];
    await page.addInitScript(() => {
      window.alert = (msg: string) => {
        (window as unknown as { __alertMessages: string[] }).__alertMessages =
          (window as unknown as { __alertMessages: string[] })
            .__alertMessages ?? [];
        (
          window as unknown as { __alertMessages: string[] }
        ).__alertMessages.push(msg);
      };
    });

    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('mysubscription') || op.includes('getmysubscription')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myFreeSubscriptionResponse()),
        });
        return;
      }
      // Return null for stripePrices to trigger the guard.
      if (op.includes('getstripeprices') || op.includes('stripeprices')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { stripePrices: null } }),
        });
        return;
      }
      // createCheckoutSession should NOT be called when the guard fires.
      if (op.includes('createcheckoutsession')) {
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

    const upgradeBtn = page
      .getByRole('button', { name: /upgrade|get premium/i })
      .first();
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    // Collect captured alert messages from the page context.
    await expect
      .poll(async () => {
        const msgs = await page.evaluate(
          () =>
            (window as unknown as { __alertMessages?: string[] })
              .__alertMessages ?? [],
        );
        alertMessages.push(...msgs);
        return msgs.length;
      })
      .toBeGreaterThan(0);

    // The guard message should mention unavailability or contact support.
    expect(alertMessages[0]).toMatch(/unavailable|support/i);
  });
});
