/**
 * Full-page redirect, isolated behind a module boundary so callers depend on
 * this function rather than `window.location` directly.
 *
 * jsdom 26 / jest-environment-jsdom 30 made `window.location` (and its
 * methods, e.g. `.replace`) fully unforgeable — neither
 * `Object.defineProperty(window, 'location', ...)` nor
 * `jest.spyOn(window.location, 'replace')` can stub it anymore (upstream:
 * jestjs/jest#15674). Routing the real navigation through this function lets
 * tests assert on redirect behaviour via `jest.mock('.../full-page-redirect')`
 * instead of fighting the jsdom global.
 */
export function fullPageRedirect(url: string): void {
  window.location.replace(url);
}
