import { expect, type Locator, type Page } from '@playwright/test';

/** Plain timer sleep (used for the inter-attempt cooldown — no Playwright frame coupling). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait up to `timeoutMs` for `locator` to become visible; resolve `true` if it
 * did, `false` if the wait expired.
 *
 * **This must not be `locator.isVisible({ timeout })` (LS-8684).** Playwright
 * documents `isVisible`'s `timeout` as deprecated *and ignored* —
 * `locator.isVisible()` "does not wait for the element to become visible and
 * returns immediately". The gate below previously polled with `isVisible`, so
 * `pollTimeoutMs` was dead: every attempt was an instantaneous check followed
 * by a `page.reload()`.
 *
 * Against the live backend that inverted the helper's purpose. These pages
 * render the awaited content only after a browser-side Apollo query resolves
 * (5-20s on the dev stack), and `waitForLoadState('load')` fires long before
 * that. So the loop reloaded roughly every `cooldownMs`, **aborting the very
 * in-flight query it was waiting on** — the content could only ever appear
 * during the closing `toBeVisible` window, when the page was finally left
 * alone. Whether a spec passed came down to whether one backend round-trip fit
 * inside that single window, which is exactly the rotating same-SHA flake
 * LS-8684 tracked (matchup-detail Phase 6 reported "not visible after 15s" —
 * its default `finalTimeoutMs` — and matchup-roster-recap Phase 1 walked its
 * whole test budget).
 *
 * `locator.waitFor` returns as soon as the element is visible and throws on
 * expiry, so the gate now spends its budget *waiting* for the query and
 * reloads only when an attempt genuinely failed.
 */
function pollVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout: Math.max(1, timeoutMs) })
    .then(() => true)
    .catch(() => false);
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
   *
   * That last claim only became true with the LS-8684 fix to `pollVisible`.
   * While the poll was a no-op `isVisible()` check, *every* extra attempt this
   * mode bought was an extra `page.reload()` that cancelled the in-flight query
   * without ever waiting on it, so budget-aware mode strictly reduced the
   * uninterrupted time a page got and made the specs it was applied to flakier,
   * not steadier. Keep `pollTimeoutMs` at or above the page's expected
   * query latency: that is what decides whether a reload is a genuine retry or
   * just an abort.
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
    // The guard reserves a full `pollTimeoutMs` on top of the closing window,
    // so the wait below can run to expiry without eating into it.
    while (remaining() > finalTimeoutMs + pollTimeoutMs + cooldownMs) {
      if (await pollVisible(locator, pollTimeoutMs)) {
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
    if (await pollVisible(locator, pollTimeoutMs)) {
      break;
    }
    await page.reload();
    await page.waitForLoadState('load');
    if (afterReload) await afterReload();
    await sleep(cooldownMs);
  }
  await expect(locator).toBeVisible({ timeout: finalTimeoutMs });
}
