/**
 * Mock Draft join-by-link E2E Tests (LS-10081)
 *
 * A Shared mock draft's invite link has the shape
 * /baseball/mock-draft/join/<inviteCode>. The route was declared as
 * "/baseball/mock-draft/join:inviteCode" (no slash before the param), so the
 * link never matched and JoinMockDraftPage never pre-filled the code. These
 * tests go through the real app router, so they fail on the old path.
 *
 * JoinMockDraftPage issues no GraphQL on render; ambient app-shell queries are
 * served by the hermetic shared baseline (route.fulfill), so no live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

const INVITE_CODE = 'ABCD2345';

test.describe('Mock Draft — join by shared link @regression', () => {
  test('shared invite link pre-fills the invite code', async ({ page }) => {
    await page.goto(`/baseball/mock-draft/join/${INVITE_CODE}`);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Join Mock Draft/i }),
    ).toBeVisible();
    await expect(page.getByLabel('Invite code')).toHaveValue(INVITE_CODE);
    await expect(
      page.getByText(/Your invite code has been pre-filled/i),
    ).toBeVisible();
  });

  test('bare join route renders an empty invite code field', async ({
    page,
  }) => {
    await page.goto('/baseball/mock-draft/join');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /Join Mock Draft/i }),
    ).toBeVisible();
    await expect(page.getByLabel('Invite code')).toHaveValue('');
    await expect(
      page.getByText(/Enter the invite code shared by the draft's creator/i),
    ).toBeVisible();
  });
});
