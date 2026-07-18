/**
 * Navigation helpers for the league-context screens.
 *
 * The league-detail routes (`baseball/league/[leagueId]`, `football/league/…`)
 * live OUTSIDE the `(tabs)` group, so the bottom tab bar is not mounted while a
 * league is open. They are also frequently the *root* of the `(app)` stack: the
 * post-login redirect in `login.tsx` uses `router.replace()` to land a returning
 * user straight on their last-visited league, leaving nothing on the back stack.
 *
 * A bare `router.back()` no-ops in that root case, stranding the user with no
 * in-app way to reach Leagues / You / Players — only the OS back gesture
 * (LS-8438). `goBackToApp` makes the header "Leagues" affordance robust to the
 * entry path: pop when there is somewhere to pop to, otherwise navigate to the
 * Leagues tab, which remounts the app-level bottom tab bar.
 */

/** App-level tab to return to from a league-context screen. */
export const LEAGUES_TAB_ROUTE = '/leagues';

/** Minimal router surface used by {@link goBackToApp} (expo-router `Router`). */
export interface BackCapableRouter {
  canGoBack: () => boolean;
  back: () => void;
  navigate: (href: string) => void;
}

/**
 * Return out of a league-context screen to the app tab shell. Pops the stack
 * when possible (preserving natural back behaviour when the league was pushed
 * from Home/Leagues), else navigates to the Leagues tab so the user is never
 * stranded when the league is the stack root.
 */
export function goBackToApp(router: BackCapableRouter): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.navigate(LEAGUES_TAB_ROUTE);
}
