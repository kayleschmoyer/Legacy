/**
 * Session-scoped persistence for NFLHome's in-page search text and archived-
 * leagues expand/collapse state.
 *
 * Mirrors `baseballHomeSessionState.ts` (LS-6284 / FBH-030): NFLHome is
 * unmounted on every sport switch — the web `onSwitchSport` action routes to
 * `/baseball` — and returning to `/football` remounts NFLHome from scratch.
 * sessionStorage survives the remount but not a new tab or a browser
 * restart, matching the expected "still there when I switch back" scope.
 *
 * Guarded exactly like `baseballHomeSessionState.ts`'s helpers: native
 * (React Native, this component's other consumer) has no `sessionStorage`
 * global, so every access degrades to a no-op there rather than throwing.
 */

const SEARCH_KEY = 'ls_football_home_search';
const SHOW_ARCHIVED_KEY = 'ls_football_home_show_archived';

export function readFootballHomeSearch(): string {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    return sessionStorage.getItem(SEARCH_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeFootballHomeSearch(value: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (value) {
      sessionStorage.setItem(SEARCH_KEY, value);
    } else {
      sessionStorage.removeItem(SEARCH_KEY);
    }
  } catch {
    // sessionStorage unavailable — search text just won't survive a remount
  }
}

export function readFootballHomeShowArchived(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(SHOW_ARCHIVED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeFootballHomeShowArchived(value: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (value) {
      sessionStorage.setItem(SHOW_ARCHIVED_KEY, '1');
    } else {
      sessionStorage.removeItem(SHOW_ARCHIVED_KEY);
    }
  } catch {
    // sessionStorage unavailable — expand/collapse just won't survive a remount
  }
}
