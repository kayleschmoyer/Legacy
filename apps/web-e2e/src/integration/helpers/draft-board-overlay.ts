import type { Page } from '@playwright/test';

/**
 * Dismiss the pick-announcement overlay if visible.
 * The overlay is position:fixed z-index 9999 and intercepts clicks, so
 * keyboard / coordinate clicks against underlying controls fail until it is
 * removed. Safe to call when the overlay is absent — short visibility check
 * with a 3 s upper bound, then no-op.
 */
export async function dismissPickAnnouncementOverlay(
  page: Page,
): Promise<void> {
  const overlay = page.locator('.d-announce-overlay');
  if (await overlay.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await overlay.click({ force: true });
    await overlay.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/**
 * When "Loading draft board..." appears on a cold-cache navigation, wait up
 * to 30 s for it to resolve to either the live board or the complete screen.
 * A genuine post-draft stuck-loading state persists indefinitely; a transient
 * in-flight one clears within a few seconds once GetLiveDraftLeagueDraft
 * resolves. The caller should then assert on the expected next state.
 */
export async function waitThroughTransientLoadingScreen(
  page: Page,
): Promise<void> {
  const loading = page.getByText('Loading draft board...');
  if (await loading.isVisible()) {
    await page
      .getByRole('main', { name: /player draft board/i })
      .or(page.getByText('Draft Complete!'))
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {
        /* still loading after grace period — caller will assert */
      });
  }
}
