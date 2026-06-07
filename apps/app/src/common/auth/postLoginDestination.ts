/**
 * Resolve the route to land on after a successful login (LGN-037).
 *
 * `EnhancedAuthGuard` renders the login screen in place at whatever route the
 * user deep-linked into (e.g. a push-notification or shared link to
 * `/baseball/league/123`), so the pathname active at success time IS the
 * destination we want to preserve. Without this the success handler hard-coded
 * `router.replace('/')`, dumping deep-linked users at the home screen.
 *
 * Auth entry points (`/login`, `/signup`) and an empty path fall back to the
 * home screen so we never strand the user on the login screen or loop them back
 * into it after they have authenticated.
 */

const HOME = '/';
const NON_DESTINATIONS = ['/login', '/signup'];

export function resolvePostLoginDestination(
  pathname: string | null | undefined,
): string {
  if (!pathname || pathname === HOME) return HOME;
  const path = pathname.split('?')[0];
  if (NON_DESTINATIONS.some((p) => path === p || path.startsWith(p + '/'))) {
    return HOME;
  }
  return pathname;
}
