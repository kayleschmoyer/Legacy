/**
 * RegExp route matchers for hermetic Playwright tests (LS-11043).
 *
 * Playwright can only forward string/RegExp/URLPattern matchers to the
 * browser-side interception layer. A single function matcher registered on a
 * page widens interception to every request (`**\/*`), so each static JS/CSS/
 * font asset from the preview server pauses for a round-trip to the test
 * process and walks the whole handler chain. Expressing every matcher as a
 * RegExp lets requests that match no route bypass the client entirely.
 *
 * Each builder is a drop-in for a former `(url: URL) => boolean` predicate;
 * `route-matchers.test.ts` pins parity against the original predicates.
 * Path matchers are case-sensitive like `URL.pathname`; scheme and host are
 * already lowercased in the URLs Playwright hands to a matcher.
 * Never use the `g`/`y` flags here: `RegExp.test` on a stateful regex is not
 * idempotent across calls.
 */

const SCHEME = '[a-z][a-z\\d+.-]*:\\/\\/';
/** `user[:pass]@` prefix, if present. */
const USERINFO = '(?:[^@/?#]*@)?';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Matches GraphQL fetch calls but not Vite HMR / source-map / bundle requests
 * that happen to contain `/graphql` in their URL. Equivalent to:
 * `s.includes('/graphql') && !s.includes('/@fs/') && !s.includes('.ts') && !s.includes('.js')`.
 */
export const GRAPHQL_ENDPOINT = /^(?!.*\/@fs\/)(?!.*\.ts)(?!.*\.js).*\/graphql/;

/**
 * Catch-all for API isolation: matches every URL EXCEPT requests to the E2E
 * static file server (`localhost` / `127.0.0.1` on `port`). Equivalent to the
 * former `!isStaticServerRequest(url)` predicate. IPv6 loopback stays
 * intercepted — `URL.hostname` keeps the brackets (`[::1]`), so the old
 * predicate's `host === '::1'` branch never matched.
 */
export function apiIsolationMatcher(port: string): RegExp {
  return new RegExp(
    `^(?!${SCHEME}${USERINFO}(?:localhost|127\\.0\\.0\\.1):${escapeRegExp(port)}(?:[/?#]|$))`,
    'i',
  );
}

/** Matches URLs whose hostname is exactly one of `hosts` (`url.hostname === host`). */
export function hostMatcher(...hosts: string[]): RegExp {
  const alternatives = hosts.map(escapeRegExp).join('|');
  return new RegExp(
    `^${SCHEME}${USERINFO}(?:${alternatives})(?::\\d+)?(?:[/?#]|$)`,
    'i',
  );
}

/** Matches URLs whose pathname contains `segment` (`url.pathname.includes(segment)`). */
export function pathIncludesMatcher(segment: string): RegExp {
  return new RegExp(`^${SCHEME}[^/?#]*(?=/)[^?#]*?${escapeRegExp(segment)}`);
}

/** Matches URLs whose pathname ends with `suffix` (`url.pathname.endsWith(suffix)`). */
export function pathEndsWithMatcher(suffix: string): RegExp {
  return new RegExp(
    `^${SCHEME}[^/?#]*(?=/)[^?#]*${escapeRegExp(suffix)}(?:[?#]|$)`,
  );
}
