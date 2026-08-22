/**
 * Session-scoped persistence for MLBHome's in-page search text and archived-
 * leagues expand/collapse state.
 *
 * MLBHome is unmounted on every sport switch — the web `onSwitchSport` action
 * (LS-5815) does a full route navigation to `/football`, and returning to
 * `/baseball` remounts MLBHome from scratch. Since `search`/`showArchived`
 * previously lived only in component `useState`, that remount silently reset
 * both, even though a page reload was never actually needed (LS-6284 /
 * FBH-030). sessionStorage survives the remount but not a new tab or a
 * browser restart, which matches the expected "still there when I switch
 * back" scope without persisting indefinitely.
 *
 * Guarded exactly like `useStepUpGate.ts`'s sessionStorage helpers: native
 * (React Native, this component's other consumer) has no `sessionStorage`
 * global, so every access degrades to a no-op there rather than throwing.
 */

const SEARCH_KEY = 'ls_baseball_home_search';
const SHOW_ARCHIVED_KEY = 'ls_baseball_home_show_archived';

export function readBaseballHomeSearch(): string {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    return sessionStorage.getItem(SEARCH_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeBaseballHomeSearch(value: string): void {
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

export function readBaseballHomeShowArchived(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(SHOW_ARCHIVED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeBaseballHomeShowArchived(value: boolean): void {
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
