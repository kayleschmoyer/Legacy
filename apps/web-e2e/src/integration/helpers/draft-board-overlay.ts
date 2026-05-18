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
  const overlay = page.getByTestId('draft-announce-overlay');
  if (await overlay.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await overlay.click({ force: true });
    await overlay.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/**
 * Hide the draft-paused overlay (`.d-paused-overlay`) via inline display:none
 * so subsequent coordinate-based clicks reach the underlying draft controls.
 *
 * LS-4091 stopped hiding the paused overlay for commissioners; the overlay is
 * `position:fixed; inset:0; z-index:5000` and intercepts every pointer event.
 * Integration tests that pause the draft for determinism (so AI auto-picks
 * don't race the UI assertions) then run as commissioner — leaving the search
 * input and watchlist buttons unreachable to real clicks. Resuming the draft
 * to clear the overlay would re-introduce the auto-pick race. Hiding the
 * overlay via JS preserves the paused engine state while letting the test
 * exercise the live-draft UI underneath.
 *
 * No-op if the overlay isn't currently rendered.
 */
export async function hidePausedDraftOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('.d-paused-overlay');
    if (overlay) overlay.style.display = 'none';
  });
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
