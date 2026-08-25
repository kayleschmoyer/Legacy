/**
 * Viewport helpers for specs whose subject is width-specific.
 *
 * ## Prefer pinning over skipping
 *
 * The suite runs under five projects (see `playwright.config.ts`): three
 * desktop engines at 1280x720 and two device projects at 375x667. Every test in
 * a spec file inherits its *project's* viewport, so a test asserting a
 * desktop-only surface fails under the mobile projects even though it exercises
 * nothing mobile-specific.
 *
 * There are two ways to deal with that, and they are not equivalent:
 *
 *   - **Pin** the describe to {@link DESKTOP_VIEWPORT}. The test still *runs*
 *     under every project; it just gets the width it was written for, so a
 *     regression in that assertion is still caught.
 *   - **Skip** it on mobile. The test stops running there entirely, and the
 *     suite reports green while covering less than it appears to.
 *
 * Pinning is the default. Skipping is a last resort that needs explicit
 * maintainer authorisation (LS-9712) — a skipped test is invisible in a green
 * run, so a suite full of them overstates its own coverage.
 *
 * Neither is the *best* option. Where the feature exists at both widths in a
 * different presentation, fix the locator so it resolves either one — e.g.
 * `PlayerStatsSurface.expectStatsSurfaceVisible()` (LS-9326) picks the desktop
 * table or the phone card feed from the actual viewport, and
 * `PlayerCompareSurface.seasonTable()` matches by accessible name so it
 * resolves the `role="table"` and `role="list"` presentations alike. Reach for
 * a pin only once no such equivalent exists.
 *
 * ## The three width splits in the app today
 *
 *   1. **Header chrome.** `NavContent` in `apps/web/src/app/app.tsx` is
 *      `display: none` below `$gtMd` (980px). The brand/home link
 *      (`header-logo`), the `Primary` nav pill tabs, and the user-profile
 *      dropdown live inside it; below the breakpoint the banner renders the
 *      hamburger, league switcher, Help and Notifications — and no links at
 *      all. The mobile counterpart has its own coverage in
 *      `mobile-responsive-nav.spec.ts`.
 *   2. **Player stats.** LS-9075 replaced the desktop data grid with
 *      `PlayersCardFeed` at phone widths, dropping sortable column headers, the
 *      format/column picker, and the Share/Export actions.
 *   3. **Draft board.** `useIsCompactDraftViewport()` swaps
 *      `EliteDraftBoardScreen`'s wide board for `CompactLiveDraftBoard` at or
 *      below `$sm` (640px).
 *
 * ## Usage
 *
 * Prefer `test.use()` at the describe level — it applies before the context is
 * created, so the first `goto` already renders at the right width and no reload
 * is needed:
 *
 * ```ts
 * test.describe('Desktop header — brand', () => {
 *   test.use({ viewport: DESKTOP_VIEWPORT });
 *   // ...
 * });
 * ```
 *
 * Note that pinning the viewport does **not** clear Playwright's `isMobile`
 * fixture — that comes from the project's device descriptor, not its width — so
 * a `test.skip(isMobile, ...)` left alongside a pin still skips the test. The
 * two do not compose; use one or the other.
 *
 * Use `page.setViewportSize()` only when a single test has to *change* width
 * partway through (e.g. asserting a responsive swap in both directions).
 */

/**
 * Matches the `chromium` / `firefox` / `webkit` project viewports, and sits
 * above the `$gtMd` (980px) breakpoint that gates the desktop header.
 */
export const DESKTOP_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * Matches the `Mobile Chrome` (Pixel 5) and `Mobile Safari` (iPhone 12) project
 * viewports. For specs that pin a phone width while running under a *desktop*
 * project.
 */
export const MOBILE_VIEWPORT = { width: 375, height: 667 } as const;
