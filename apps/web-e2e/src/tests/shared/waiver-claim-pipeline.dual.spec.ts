/**
 * Waiver-claim pipeline — dual-mode (LS-9738, migration matrix row #1,
 * `docs/dev-process/e2e-dual-mode-migration-matrix.md`).
 *
 * Covers the UI-mechanics slice of `waiver-processing-ui.integration.spec.ts`
 * (LS-751): submit a claim (2 competing teams, via the multi-actor fixture —
 * LS-9736), pending-claim card visible for both, process, pending-claim card
 * absent post-processing.
 *
 * Deliberately does NOT cover the real waiver-order priority resolution, the
 * live async-Lambda race (LS-3809, the exact regression this spec's live
 * sibling exists to guard), or waiver-order rotation — those stay live-only
 * in `waiver-processing-ui.integration.spec.ts` Phases 4/7/8 per the
 * migration matrix's explicit correctness-drift guidance.
 * `TestData.waiverQueue()` resolves claims deterministically (earliest
 * submission wins), never reimplementing the real algorithm.
 */
import { expect, test } from '../../fixtures/dual';
import { PlaywrightWebDriver } from '../../driver';
import { FreeAgentsPage } from '../../pages/free-agents.page';
import { WaiversPage } from '../../pages/waivers.page';

test.describe('Waiver claim pipeline (dual-mode) @dual @regression', () => {
  test('a competing claim submitted through the UI shows pending on both teams, then absent after processing', async ({
    page,
    driver,
    testData,
    counterpartyPage,
    counterpartyTestData,
  }) => {
    const queue = await testData.waiverQueue();
    // The competing team's own claim is submitted as a side effect of this
    // call (see `TestData.waiverQueue()`'s doc comment) — it is already
    // pending, for the SAME free agent, before the primary page submits its
    // own claim below.
    const counterpartyQueue = await counterpartyTestData.waiverQueue();
    expect(counterpartyQueue.leagueId).toBe(queue.leagueId);
    expect(counterpartyQueue.freeAgent.playerId).toBe(queue.freeAgent.playerId);

    await test.step('Submit a competing claim for the free agent via the free-agents UI', async () => {
      const freeAgentsPage = new FreeAgentsPage(driver);
      await freeAgentsPage.goto(queue.leagueId);
      await freeAgentsPage.openClaimModal(queue.freeAgent.fullName);
      await freeAgentsPage.claimModalHeader.expectVisible({ timeout: 10_000 });
      await freeAgentsPage.submitClaim();
      await freeAgentsPage.successHeader.expectVisible({ timeout: 20_000 });
      await freeAgentsPage.closeSuccess();
    });

    await test.step('Pending-claim card is visible on both teams', async () => {
      const waiversPage = new WaiversPage(driver);
      await waiversPage.goto(queue.leagueId);
      // Below the Tamagui `md` breakpoint (Mobile Chrome) `PendingWaiverClaims`
      // renders only the condensed summary pill, not the full panel header —
      // see `WaiversPage.isCompactSurface()`'s doc comment.
      if (waiversPage.isCompactSurface()) {
        await waiversPage.compactSummary(1).expectVisible({ timeout: 15_000 });
      } else {
        await waiversPage.header.expectVisible({ timeout: 15_000 });
      }

      await counterpartyPage.goto(
        `/baseball/league/${counterpartyQueue.leagueId}/roster`,
      );
      // Same project/viewport as `page` (see `WaiversPage.isCompactSurface`'s
      // doc comment), so `counterpartyPage` renders the same surface.
      const counterpartyWaiversPage = new WaiversPage(
        new PlaywrightWebDriver(counterpartyPage),
      );
      if (counterpartyWaiversPage.isCompactSurface()) {
        await counterpartyWaiversPage
          .compactSummary(1)
          .expectVisible({ timeout: 15_000 });
      } else {
        await expect(
          counterpartyPage
            .getByTestId('main-content')
            .getByText('Pending Waiver Claims'),
        ).toBeVisible({ timeout: 15_000 });
      }
    });

    await test.step('Commissioner processes waivers from the commissioner panel', async () => {
      await page.goto(`/baseball/league/${queue.leagueId}/commissioner`);
      await page.getByRole('button', { name: /Waiver Processing/i }).click();
      await page.getByRole('button', { name: /Process Waivers Now/i }).click();
      await page.getByRole('button', { name: /Confirm/i }).click();
      // Resolution is deterministic (see file header) — the panel's own
      // wording covers whichever verb resolved it (mock or live-seeded
      // state), not the real priority-resolution message.
      await expect(
        page.getByRole('status').filter({ hasText: /processed|succeeded/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Pending-claim card is absent on both teams after processing', async () => {
      const waiversPage = new WaiversPage(driver);
      await waiversPage.goto(queue.leagueId);
      await waiversPage.header.expectHidden({ timeout: 15_000 });

      await counterpartyPage.goto(
        `/baseball/league/${counterpartyQueue.leagueId}/roster`,
      );
      await expect(
        counterpartyPage
          .getByTestId('main-content')
          .getByText('Pending Waiver Claims'),
      ).not.toBeVisible({ timeout: 15_000 });
    });
  });
});
