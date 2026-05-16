import { expect, type Locator, type Page } from '@playwright/test';

interface ReloadUntilVisibleOptions {
  /** Maximum number of reload attempts before letting the final assertion run. */
  attempts?: number;
  /** Per-poll wait used to give the locator a chance to mount before reloading. */
  pollTimeoutMs?: number;
  /** Cooldown between failed checks and the next reload. */
  cooldownMs?: number;
  /** Timeout for the final strict `toBeVisible` assertion. */
  finalTimeoutMs?: number;
  /** Optional async action to run after each reload (e.g. extra waitForLoadState). */
  afterReload?: () => Promise<void>;
}

/**
 * Reload the page up to `attempts` times until `locator` becomes visible, then
 * assert visibility strictly. Replaces the antipattern of an `if-break` loop
 * with a deterministic helper that lints clean and always ends in a strict
 * `expect(...).toBeVisible()`.
 *
 * Use only when reload is genuinely required to refresh server-cached state
 * (e.g. Apollo cache miss after a backend mutation). For pure UI waiting, prefer
 * `await expect(locator).toBeVisible({ timeout })` directly.
 */
export async function reloadUntilVisible(
  page: Page,
  locator: Locator,
  {
    attempts = 3,
    pollTimeoutMs = 5_000,
    cooldownMs = 2_000,
    finalTimeoutMs = 15_000,
    afterReload,
  }: ReloadUntilVisibleOptions = {},
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (
      await locator.isVisible({ timeout: pollTimeoutMs }).catch(() => false)
    ) {
      break;
    }
    await page.reload();
    await page.waitForLoadState('load');
    if (afterReload) await afterReload();
    await page.waitForTimeout(cooldownMs);
  }
  await expect(locator).toBeVisible({ timeout: finalTimeoutMs });
}
