/**
 * Browser-storage entries that belong to the signed-in user rather than the
 * device, and the cleanup an explicit Sign Out runs on them (LS-10787).
 *
 * Sign Out must leave nothing behind that tells the next person on a shared
 * browser which leagues or pages the previous user visited, or that sends
 * them to the previous user's league. AuthService.clearTokens() already drops
 * the session itself (tokens, CSRF, cached profile); this covers the rest.
 *
 * Runs only on an explicit Sign Out (wired into AuthProvider's `onLogout` in
 * main.tsx). A session expiry keeps these entries so the post-login redirect
 * can return the same user to their last league (LS-6694); that redirect is
 * itself scoped to the user id stored with the league
 * (see last-visited-league.ts).
 *
 * Kept on purpose (device settings, not user data): the theme
 * (`ls_theme_preference`), table column/section layout and tooltip-seen flags,
 * and the per-tab home-page search/archived filters. `ls_onboarding_*` keys are
 * already keyed by user id. The push-subscription fingerprint is cleared
 * separately by clearWebPushRegistration().
 */
import { LOGGER } from '@legacy-sports/logging';
import { clearStepUp } from '@legacy-sports/shared-components/auth';
import {
  LAST_VISITED_LEAGUE_KEY,
  USER_PREFERENCES_STORAGE_KEY,
} from '@legacy-sports/shared-components/utils';
import { readCachedUserId } from './session-precache';
import { LAST_READ_CHAT_KEY_PREFIX } from '../utils/lastReadChatMessage';

const SCROLL_POSITION_KEY_PREFIX = 'scroll:';
const LEAGUE_ROLE_KEY_PREFIX = 'ls-v2-role:';

/** sessionStorage key for the saved scroll position of a visited route. */
export function scrollPositionKey(pathname: string): string {
  return `${SCROLL_POSITION_KEY_PREFIX}${pathname}`;
}

/**
 * Build the scroll-position saver for one route. The saver skips the write
 * when a session that existed when it was created has since ended: Sign Out
 * unmounts the app, and the route's unmount save would otherwise re-create
 * the `scroll:*` key right after clearUserScopedStorage() removed it.
 * Signed-out browsing (public pages) still saves normally.
 */
export function makeScrollPositionSaver(pathname: string): () => void {
  const signedInAtStart = readCachedUserId() !== null;
  return () => {
    if (signedInAtStart && readCachedUserId() === null) return;
    try {
      sessionStorage.setItem(
        scrollPositionKey(pathname),
        String(window.scrollY),
      );
    } catch {
      // Ignore storage errors (private browsing, quota exceeded).
    }
  };
}

/** localStorage key for the role the user picked on a league page. */
export function leagueRoleKey(leagueId: number): string {
  return `${LEAGUE_ROLE_KEY_PREFIX}${leagueId}`;
}

/** localStorage entries removed outright on Sign Out. */
const USER_SCOPED_LOCAL_KEYS = [
  LAST_VISITED_LEAGUE_KEY,
  // Per-user display preferences. The server copy (user_preferences) is the
  // source of truth and re-hydrates on the next sign-in.
  USER_PREFERENCES_STORAGE_KEY,
];

/** localStorage key prefixes removed on Sign Out (one entry per league/chat). */
const USER_SCOPED_LOCAL_PREFIXES = [
  LEAGUE_ROLE_KEY_PREFIX,
  LAST_READ_CHAT_KEY_PREFIX,
];

/** sessionStorage key prefixes removed on Sign Out (one entry per route). */
const USER_SCOPED_SESSION_PREFIXES = [SCROLL_POSITION_KEY_PREFIX];

function removeMatching(
  storage: Storage,
  keys: readonly string[],
  prefixes: readonly string[],
): void {
  // Collect first: removing while iterating by index skips entries.
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null) continue;
    if (keys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
      doomed.push(key);
    }
  }
  for (const key of doomed) storage.removeItem(key);
}

/**
 * Remove every user-scoped entry listed above from localStorage and
 * sessionStorage. Best-effort: storage can be unavailable (private mode,
 * blocked site data), and a failure must never block signing out.
 */
export function clearUserScopedStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      removeMatching(
        localStorage,
        USER_SCOPED_LOCAL_KEYS,
        USER_SCOPED_LOCAL_PREFIXES,
      );
    }
    if (typeof sessionStorage !== 'undefined') {
      removeMatching(sessionStorage, [], USER_SCOPED_SESSION_PREFIXES);
    }
  } catch (error) {
    LOGGER.warn(
      'Failed to clear user-scoped storage on sign-out:',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  // The step-up (re-verification) window must not carry over to whoever
  // signs in next in this tab.
  clearStepUp();
}
