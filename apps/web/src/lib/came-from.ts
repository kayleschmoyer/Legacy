/**
 * Deep-link / "came-from" preservation across auth flows.
 *
 * When an unauthenticated user navigates to a protected route (e.g.
 * `/trade-center?leagueId=42`), the auth guard renders the LoginPage at that
 * URL. After sign-in, `resolvePostLoginRedirect` consumes this value so the
 * user lands back where they started instead of at the app root.
 *
 * Used by three sign-in paths:
 *   - Discord (LGN-037): full-page OAuth redirect wipes the URL, so we stash
 *     the path before navigating to Discord and restore it on callback.
 *   - Google popup (LS-7520): `resolvePostLoginRedirect` calls `replaceState`
 *     after auth; without a stored came-from it would fall back to the
 *     last-visited league instead of the original deep-link.
 *   - Google One Tap (LS-7523): same issue as the popup path — the One Tap
 *     handler calls `resolvePostLoginRedirect` and needs the stored value.
 *
 * The stored value is always re-validated through `getSafeRedirectTarget` by
 * the caller before it is used for navigation, so this module never opens an
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
