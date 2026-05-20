/**
 * E2E tests for the Donate page (/donate).
 *
 * Covers:
 * - Error state: when GetDonationPaymentLink errors, an explanatory callout
 *   renders above the disabled CTA so the user knows donations are
 *   temporarily unavailable (LS-4016).
 * - Success state: when the donation link loads, the CTA is enabled and the
 *   error callout is not present.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const UNAVAILABLE_HEADLINE = /donations are temporarily unavailable/i;
const CTA_NAME = /donate via stripe/i;

test.describe('Donate page — donation link failure @regression', () => {
  test('shows explanatory callout when the donation link query errors', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('getdonationpaymentlink')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Donation link unavailable' }],
          }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/donate');
    await page.waitForLoadState('load');

    await expect(page.getByText(UNAVAILABLE_HEADLINE)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: CTA_NAME })).toBeDisabled();
  });

  test('hides the callout and enables the CTA when the donation link loads', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = route.request().postData()?.toLowerCase() ?? '';
      if (op.includes('getdonationpaymentlink')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              donationPaymentLink: {
                __typename: 'DonationPaymentLinkResult',
                url: 'https://buy.stripe.com/test_link',
              },
            },
          }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/donate');
    await page.waitForLoadState('load');

    await expect(page.getByRole('button', { name: CTA_NAME })).toBeEnabled({
      timeout: 10_000,
    });
    await expect(page.getByText(UNAVAILABLE_HEADLINE)).toHaveCount(0);
  });
});
