/**
 * Mobile wrapper for last-visited-league persistence (LS-6694 / LGN-039).
 *
 * Persists the league a user most recently opened in `AsyncStorage` so the
 * login flow can redirect a returning user straight back to that league instead
 * of the generic `/` landing route. The canonical shape, key, and validation
 * rules live in `@legacy-sports/shared-components/utils` and are shared with the
 * web wrapper.
 *
 * This pointer must not outlive the install that wrote it. AsyncStorage keeps
 * its data in `databases/RKStorage`, which Android Auto Backup archives and
 * restores at install time; the app therefore used to ship with
 * `android:allowBackup="true"` and a reinstall would resurrect a league pointer
 * from the *previous* install. The credential that would have justified acting
 * on it does not come back with it — expo-secure-store's values are encrypted
 * with an Android Keystore key, and the keystore is never backed up — so the
 * user signed in as if new and was dropped straight into a stale league instead
 * of home. `android.allowBackup` is now `false` (`apps/app/app.json`), which is
 * what makes a fresh install actually fresh.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';
import {
  LAST_VISITED_LEAGUE_KEY,
  type LastVisitedLeague,
  makeLastVisitedLeague,
  parseLastVisitedLeague,
  serializeLastVisitedLeague,
} from '@legacy-sports/shared-components/utils';

/** Read the persisted last-visited league, or `null` if none/unavailable/malformed. */
export async function getLastVisitedLeague(): Promise<LastVisitedLeague | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_VISITED_LEAGUE_KEY);
    return parseLastVisitedLeague(raw);
  } catch (error) {
    // Best-effort persistence — warn (not error) so it doesn't page Rollbar.
    LOGGER.warn(
      'Failed to read last visited league',
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Persist the league the user just opened. No-ops on an invalid id; storage
 * failures are logged but never surfaced — persistence is best-effort and must
 * not disrupt rendering the league screen.
 */
export function setLastVisitedLeague(
  leagueId: number,
  sport: string | null | undefined,
): void {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return;
  AsyncStorage.setItem(
    LAST_VISITED_LEAGUE_KEY,
    serializeLastVisitedLeague(makeLastVisitedLeague(leagueId, sport)),
  ).catch((error: unknown) => {
    // Best-effort persistence — warn (not error) so it doesn't page Rollbar.
    LOGGER.warn(
      'Failed to persist last visited league',
      error instanceof Error ? error : new Error(String(error)),
    );
  });
}
