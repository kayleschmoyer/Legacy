import { expect, type Locator, type Page } from '@playwright/test';

/** Plain timer sleep (used for the inter-attempt cooldown — no Playwright frame coupling). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ReloadUntilVisibleOptions {
  /**
   * Maximum number of reload attempts before letting the final assertion run.
   * Ignored when `budgetMs` is set (the loop is then bounded by wall-time, not
   * a fixed count).
   */
  attempts?: number;
  /** Per-poll wait used to give the locator a chance to mount before reloading. */
  pollTimeoutMs?: number;
  /** Cooldown between failed checks and the next reload. */
  cooldownMs?: number;
  /** Timeout for the final strict `toBeVisible` assertion. */
  finalTimeoutMs?: number;
  /** Optional async action to run after each reload (e.g. extra waitForLoadState). */
  afterReload?: () => Promise<void>;
  /**
   * When set, the gate becomes **budget-aware** (LS-8211): instead of a fixed
   * `attempts` count, it keeps reloading + re-polling until roughly `budgetMs`
   * of wall-time (measured from the first poll) has elapsed, reserving the
   * final window for the closing strict assertion. Pass the time the
   * surrounding test can afford to spend on this gate (well within its
   * `test.setTimeout(...)`).
   *
   * This converges the 429-throttled integration "timeout" tail: under
   * sustained backend throttling + read-replica lag, the browser-side Apollo
   * query that renders the awaited UI is starved. A fixed 3-reload gate
   * exhausts long before the 120-180s test budget, so the residual one-shot
   * assertion then walks the full timeout. Coupling the reload count to the
   * test budget keeps the gate re-firing the starved query until just before
   * the deadline instead of giving up early.
   *
   * Budget-aware mode is strictly *more lenient* than the fixed-attempts mode:
   * it breaks immediately on the first successful poll (so a healthy page pays
   * no extra cost) and only ever adds reload attempts within the test's own
   * timeout — it cannot turn a passing spec into a failing one.
   */
  budgetMs?: number;
}

/**
 * Reload the page until `locator` becomes visible, then assert visibility
 * strictly. Replaces the antipattern of an `if-break` loop with a deterministic
 * helper that lints clean and always ends in a strict `expect(...).toBeVisible()`.
 *
 * Two modes:
 * - **Fixed attempts (default)**: reload up to `attempts` times, then a final
 *   `toBeVisible({ timeout: finalTimeoutMs })`.
 * - **Budget-aware (`budgetMs` set)**: keep reloading + re-polling until the
 *   wall-time budget is nearly exhausted, then a final strict assertion that
 *   consumes whatever budget remains. See `budgetMs` above (LS-8211).
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
    budgetMs,
  }: ReloadUntilVisibleOptions = {},
): Promise<void> {
  if (budgetMs != null) {
    const start = Date.now();
    const remaining = () => budgetMs - (Date.now() - start);
    // Keep reloading while there is room for at least one more poll+reload
    // cycle on top of the reserved closing assertion window.
    while (remaining() > finalTimeoutMs + pollTimeoutMs + cooldownMs) {
      if (
        await locator.isVisible({ timeout: pollTimeoutMs }).catch(() => false)
      ) {
        break;
      }
      // Bound the reload itself to the remaining budget (minus the reserved
      // closing window). `page.reload()` / `waitForLoadState` otherwise default
      // to Playwright's navigation timeout (~30s each), so a navigation stalled
      // under 429 throttling could blow far past `budgetMs` — defeating the
      // whole point of a wall-time budget and walking the surrounding test's
      // hard timeout (LS-8211).
      await page
        .reload({
          timeout: Math.max(1_000, remaining() - finalTimeoutMs - cooldownMs),
        })
        .catch(() => undefined);
      await page
        .waitForLoadState('load', {
          timeout: Math.max(1_000, remaining() - finalTimeoutMs),
        })
        .catch(() => undefined);
      if (afterReload) await afterReload();
      await sleep(cooldownMs);
    }
    // Closing strict assertion runs within whatever budget remains, so the
    // gate's total wall-time never exceeds `budgetMs`. Clamped to a 1s floor so
    // a page that arrives right at the deadline still resolves; if the budget
    // is fully spent it fails fast with a clean `toBeVisible` error instead of
    // letting the surrounding test walk its hard timeout.
    await expect(locator).toBeVisible({
      timeout: Math.min(finalTimeoutMs, Math.max(1_000, remaining())),
    });
    return;
  }

  for (let i = 0; i < attempts; i++) {
    if (
      await locator.isVisible({ timeout: pollTimeoutMs }).catch(() => false)
    ) {
      break;
    }
    await page.reload();
    await page.waitForLoadState('load');
    if (afterReload) await afterReload();
    await sleep(cooldownMs);
  }
  await expect(locator).toBeVisible({ timeout: finalTimeoutMs });
}
