/**
 * Kicks off the Home page's lazy-loaded JS chunk in the background so the
 * top-left logo/home link doesn't have to wait on a fresh network fetch +
 * chunk parse the first time it's clicked (LS-9350). Home is one of many
 * routes split via `lazyWithRetry` in app.tsx, so its chunk otherwise only
 * starts downloading when React first tries to render it — noticeably slow
 * when a user's first authenticated page isn't Home (e.g. a deep link
 * straight into a league page).
 *
 * Safe to call repeatedly: the browser dedupes concurrent/repeat dynamic
 * imports of the same module.
 *
 * Failures are swallowed: this is a best-effort background optimization, not
 * the real navigation — if the chunk fails to load here (offline, a
 * transient CDN error), the eventual real render of HomePage still goes
 * through `lazyWithRetry`'s own fetch/retry path, so there's nothing to
 * surface as an unhandled rejection.
 */
export function prefetchHomePage(): Promise<unknown> {
  return import('../pages/home/HomePage').catch(() => undefined);
}
