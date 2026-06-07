/**
 * Deep-link / "came-from" preservation across the Discord OAuth round-trip.
 *
 * The Discord sign-in flow navigates the browser away to the OAuth proxy and
 * back to `/auth/discord/callback`, so the path the user originally requested
 * (e.g. `/league/123`) is gone from the URL by the time we exchange the code.
 * We stash it in `sessionStorage` before leaving and consume it on return so
 * the user lands back where they started instead of at the app root (LGN-037).
 *
 * Google web sign-in does NOT need this: it authenticates in-memory without a
 * full-page navigation, so `EnhancedAuthGuard` simply swaps in the app at the
 * unchanged URL. This module is therefore Discord-specific.
 *
 * The stored value is always re-validated through `getSafeRedirectTarget` by the
 * caller before it is used for navigation, so this module never opens an
 * open-redirect hole on its own — it only persists a candidate path.
 */

const CAME_FROM_KEY = 'ls_login_came_from';

/**
 * Paths that must never be used as a post-login destination: the auth entry
 * points (which an authenticated user is bounced away from) and the Discord
 * callback route (which would re-trigger the exchange). Matched against the
 * pathname only.
 */
const NON_DESTINATION_PREFIXES = [
  '/login',
  '/signup',
  '/auth/discord/callback',
];

/** Extract the pathname portion of a `path?query#hash` string. */
function pathnameOf(path: string): string {
  return path.split('?')[0].split('#')[0];
}

function isMeaningfulDestination(pathname: string): boolean {
  if (!pathname || pathname === '/') return false;
  return !NON_DESTINATION_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

/**
 * Capture the current location (path + query + hash) as the post-login
 * destination, when it points at a meaningful page. No-ops on the auth entry
 * points, the app root, and when `sessionStorage` is unavailable.
 */
export function storeCameFrom(): void {
  try {
    if (
      typeof window === 'undefined' ||
      typeof sessionStorage === 'undefined'
    ) {
      return;
    }
    const { pathname, search, hash } = window.location;
    if (!isMeaningfulDestination(pathname)) return;
    sessionStorage.setItem(CAME_FROM_KEY, `${pathname}${search}${hash}`);
  } catch {
    // sessionStorage can throw in private-browsing / quota-exceeded modes.
    // Preserving the deep link is best-effort, so swallow and fall back to root.
  }
}

/**
 * Read and clear the stored post-login destination. Returns `null` when nothing
 * was stored or the stored value is not a meaningful destination.
 */
export function consumeCameFrom(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = sessionStorage.getItem(CAME_FROM_KEY);
    if (value === null) return null;
    sessionStorage.removeItem(CAME_FROM_KEY);
    return isMeaningfulDestination(pathnameOf(value)) ? value : null;
  } catch {
    return null;
  }
}
