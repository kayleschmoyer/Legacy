/**
 * Contract tests for the `reloadUntilVisible` integration helper (LS-8684).
 *
 * Hermetic — every request is served by `page.route`, so these never touch the
 * live backend or the network. They run in well under a few seconds each.
 *
 * They guard the invariant the LS-8684 flake violated: **the gate must actually
 * wait on the locator before it reloads.** The helper used to poll with
 * `locator.isVisible({ timeout: pollTimeoutMs })`, whose `timeout` Playwright
 * documents as deprecated *and ignored* — `isVisible()` returns immediately.
 * So `pollTimeoutMs` was dead and every attempt was an instant check followed
 * by a `page.reload()`.
 *
 * On the real specs that inverted the helper's purpose: the awaited content
 * only renders once a browser-side Apollo query resolves, and each reload
 * aborted that in-flight query, so the content could only ever appear during
 * the closing `toBeVisible` window. Whether a spec passed came down to whether
 * one backend round-trip fit inside that single window — the rotating,
 * same-SHA, passes-on-rerun flake LS-8684 tracked.
 *
 * Test 1 is the regression guard proper: it fails against the old
 * `isVisible`-based implementation (which would reload straight past a slow
 * element) and passes against the fixed one. Tests 2 and 3 pin the behaviour
 * that must NOT regress in the other direction — the gate still reloads when a
 * poll genuinely expires, and budget-aware mode still honours its budget.
 *
 * Located under `integration/tests/` so the existing Playwright integration
 * runner picks them up, matching the wait-for-join-page-helpers precedent.
 */
import { expect, type Page, test } from '@playwright/test';
import { reloadUntilVisible } from '../helpers/reload-until-visible';

/** Routed, never resolved over the network. */
const FIXTURE_URL = 'http://reload-until-visible.test/fixture';

const HEADING = 'Player Matchups';

/**
 * A page whose heading only appears `delayMs` after load — standing in for the
 * real specs' "renders once the Apollo query resolves" behaviour. Crucially the
 * timer restarts on every load, exactly like a reload restarting the query.
 */
function fixtureHtml(delayMs: number): string {
  return `<!doctype html>
<html>
  <body>
    <div id="root">loading</div>
    <script>
      setTimeout(function () {
        var h = document.createElement('h1');
        h.textContent = ${JSON.stringify(HEADING)};
        document.body.appendChild(h);
      }, ${delayMs});
    </script>
  </body>
</html>`;
}

/**
 * Route FIXTURE_URL to a page that reveals the heading after `delayMs`, then
 * load it once. Returns a counter of how many times the document was fetched —
 * one for the initial `goto`, plus one per `page.reload()`.
 */
async function serveFixture(
  page: Page,
  delayMs: number,
): Promise<() => number> {
  let loads = 0;
  await page.route(FIXTURE_URL, async (route) => {
    loads += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixtureHtml(delayMs),
    });
  });
  await page.goto(FIXTURE_URL);
  return () => loads;
}

test.describe('reloadUntilVisible (LS-8684)', () => {
  test('waits out a slow-rendering element instead of reloading past it', async ({
    page,
  }) => {
    // The heading lands at ~2s, comfortably inside a 6s poll window. A gate
    // that honours `pollTimeoutMs` sees it on the first attempt and never
    // reloads. The pre-fix gate polled instantly, so it would have burned all
    // three attempts (restarting the 2s timer each time) before the element
    // ever had a chance to appear.
    const loadCount = await serveFixture(page, 2_000);

    await reloadUntilVisible(
      page,
      page.getByRole('heading', { name: HEADING }),
      {
        attempts: 3,
        pollTimeoutMs: 6_000,
        cooldownMs: 100,
        finalTimeoutMs: 1_000,
      },
    );

    expect(
      loadCount(),
      'the gate should resolve on the initial load, with no reloads',
    ).toBe(1);
  });

  test('still reloads when a poll genuinely expires', async ({ page }) => {
    // The heading never arrives within the test, so every poll expires and the
    // gate must fall through to its reload path and then fail loudly.
    const loadCount = await serveFixture(page, 600_000);

    await expect(
      reloadUntilVisible(page, page.getByRole('heading', { name: HEADING }), {
        attempts: 2,
        pollTimeoutMs: 300,
        cooldownMs: 50,
        finalTimeoutMs: 300,
      }),
    ).rejects.toThrow();

    expect(
      loadCount(),
      'initial load plus one reload per exhausted attempt',
    ).toBe(3);
  });

  test('budget-aware mode reloads but stays within its wall-time budget', async ({
    page,
  }) => {
    const loadCount = await serveFixture(page, 600_000);
    const start = Date.now();

    await expect(
      reloadUntilVisible(page, page.getByRole('heading', { name: HEADING }), {
        pollTimeoutMs: 500,
        cooldownMs: 100,
        finalTimeoutMs: 1_000,
        budgetMs: 4_000,
      }),
    ).rejects.toThrow();

    const elapsed = Date.now() - start;
    expect(
      loadCount(),
      'budget-aware mode should still reload while budget remains',
    ).toBeGreaterThan(1);
    // Generous upper bound: the point is that the gate is bounded by budgetMs
    // rather than walking the surrounding test timeout, not that it is precise.
    expect(
      elapsed,
      `gate took ${elapsed}ms against a 4000ms budget`,
    ).toBeLessThan(10_000);
  });
});
