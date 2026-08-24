import { test, type TestInfo } from '@playwright/test';

/**
 * Skip the current test under a mobile Playwright project ("Mobile Chrome" /
 * "Mobile Safari" — see `apps/web-e2e/playwright.config.ts`).
 *
 * Every test in a spec file inherits its *project's* default viewport, not
 * just tests that opt into a narrow viewport explicitly (`navHeader.goMobile()`,
 * `page.setViewportSize(...)`) — so a test asserting a desktop-only header
 * affordance (the brand/logo, primary-nav pill links, the profile-dropdown
 * trigger — none of which have a mobile-header equivalent by design; the app
 * shell renders a reduced mobile header and defers the rest to the hamburger
 * drawer) needs an explicit opt-out, or it fails at the Mobile Chrome/Safari
 * viewport even though it exercises nothing mobile-specific (LS-9712).
 *
 * Call at the top of the test body (or a `beforeEach`) with the `testInfo`
 * every test callback already receives as its second argument.
 */
export function skipOnMobileProject(testInfo: TestInfo, reason: string): void {
  test.skip(testInfo.project.name.startsWith('Mobile'), reason);
}
