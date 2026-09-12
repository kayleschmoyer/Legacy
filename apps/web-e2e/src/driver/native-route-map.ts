/**
 * Native route-parity seam (ADR-0016 amendment — LS-9653).
 *
 * ADR-0016's native rollout blueprint assumed "app routes are URL-shaped on
 * both platforms," so {@link ../appium-native.driver.AppiumNativeDriver.open}
 * could deep-link whatever path a page object passed, verbatim. That premise
 * holds for most routes (they mirror an expo-router file 1:1) but not for
 * tab-addressed screens: web addresses a league tab by path segment
 * (`/football/league/1/roster`), while native selects the tab from an
 * `initialTab` query param on one screen route
 * (`apps/app/src/app/(app)/football/league/[leagueId].tsx`) — there is no
 * `roster.tsx` file. League discovery has the same shape mismatch: web is
 * sport-scoped (`/football/leagues`), native is one sport-agnostic screen
 * (`apps/app/src/app/(app)/league-discovery.tsx`).
 *
 * Team Detail (LS-9657) adds a third shape: web addresses it as
 * `/:sport/teams/:teamId` (plural) while native's expo-router file is
 * `team/[teamId].tsx` (singular), and football's native screen renders the
 * lineup board on a `Lineup` tab rather than as the screen itself.
 *
 * `/draft` and `/draft/watch` share the same broken URL shape — they were the
 * worked example in this ticket's own technical approach — but resolve to
 * dedicated top-level native screens (`DraftBoardPage`, `DraftWatchPage`),
 * not an `initialTab` on `[leagueId].tsx`; web routes them to a dedicated
 * `EliteDraftBoardScreen`/`EliteDraftSpectatorScreen` too (registered ahead of
 * the generic `/:sport/league/:id/:tab` route in `apps/web/src/app/app.tsx`),
 * so they were never really one of the LeagueDetailShell's tabs on either
 * platform.
 *
 * This module is the driver-level route-translation table the ticket
 * recommends: it rewrites the small set of neutral paths whose native shape
 * genuinely differs, and leaves everything else untouched (most routes are
 * still URL-shaped on both platforms, so a general 1:1 passthrough is
 * correct, not a gap). A path that *looks* tab-addressed but names a tab this
 * table doesn't recognize fails loudly here — a clear thrown error before any
 * deep link is issued — rather than opening the league's default tab and
 * leaving a spec to time out on an assertion that can never pass.
 *
 * Kept as a pure function (no wdio/driver dependency) so it is unit-testable
 * without an emulator (`native-route-map.test.ts`) and reusable if a second
 * native driver (e.g. iOS) ever lands.
 */

/** Sports that have a native league-detail + discovery screen. */
const SPORTS = ['baseball', 'football'] as const;
type Sport = (typeof SPORTS)[number];

/**
 * Valid `initialTab` values per sport, mirroring each sport's
 * `BASE_*_LEAGUE_TABS` (+ the conditional `waivers` tab) in
 * `apps/app/src/app/(app)/<sport>/league/[leagueId].tsx`. Kept as an explicit
 * list (rather than derived at test-runtime from app source) per the driver
 * route-map's accepted cost of a second source of truth — the tradeoff this
 * ADR amendment records — so it must be updated alongside a new tab, and a
 * stale entry fails loudly here instead of silently opening the wrong tab.
 */
const VALID_LEAGUE_TABS: Readonly<Record<Sport, ReadonlySet<string>>> = {
  baseball: new Set([
    'overview',
    'roster',
    'free-agents',
    'matchups',
    'trades',
    'waivers',
    'standings',
    'history',
    'chat',
    'commissioner',
  ]),
  football: new Set([
    'overview',
    'roster',
    'free-agents',
    'matchups',
    'trades',
    'waivers',
    'standings',
    'chat',
    'commissioner',
  ]),
};

const LEAGUE_TAB_PATH = /^\/(baseball|football)\/league\/(\d+)\/([a-z-]+)$/;
const TEAM_DETAIL_PATH = /^\/(baseball|football)\/teams\/(\d+)$/;
const LEAGUE_DISCOVERY_PATH = /^\/(baseball|football)\/leagues$/;
const LEAGUE_DRAFT_PATH = /^\/(baseball|football)\/league\/(\d+)\/draft$/;
const LEAGUE_DRAFT_WATCH_PATH =
  /^\/(baseball|football)\/league\/(\d+)\/draft\/watch$/;

function isSport(value: string): value is Sport {
  return (SPORTS as readonly string[]).includes(value);
}

/**
 * Thrown when a neutral path names a shape this table recognizes (a
 * tab-addressed league route) but a tab it doesn't — the loud-diagnostic
 * requirement: a spec author gets a thrown error naming the bad path and the
 * valid tabs, not a blank screen or a timed-out assertion three lines later.
 */
export class UnmappedNativeRouteError extends Error {
  constructor(path: string, reason: string) {
    super(
      `AppiumNativeDriver: no native route mapping for "${path}" — ${reason}. ` +
        `Add a mapping in apps/web-e2e/src/driver/native-route-map.ts (or fix the ` +
        `caller) rather than deep-linking a route the app can't resolve.`,
    );
    this.name = 'UnmappedNativeRouteError';
  }
}

/**
 * Translate a platform-neutral route (the same path a page object passes to
 * `PlaywrightWebDriver.open`) into the native app path `AppiumNativeDriver`
 * should deep-link. Paths outside the tab-addressed/discovery shapes pass
 * through unchanged — expo-router mirrors most web routes 1:1.
 */
export function resolveNativeRoute(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  const discoveryMatch = normalized.match(LEAGUE_DISCOVERY_PATH);
  if (discoveryMatch) {
    // Native has one sport-agnostic discovery screen; the sport segment has
    // no native equivalent to carry today (a product-scope gap, not this
    // seam's to close — see the ticket's Out of Scope).
    return '/league-discovery';
  }

  // Checked before the generic tab pattern: `/draft/watch` also matches
  // `LEAGUE_TAB_PATH`'s shape one segment short, but both draft routes are
  // dedicated top-level screens, never an `initialTab`.
  const draftWatchMatch = normalized.match(LEAGUE_DRAFT_WATCH_PATH);
  if (draftWatchMatch) {
    const [, , leagueId] = draftWatchMatch;
    return `/DraftWatchPage?leagueId=${leagueId}`;
  }

  const draftMatch = normalized.match(LEAGUE_DRAFT_PATH);
  if (draftMatch) {
    const [, , leagueId] = draftMatch;
    return `/DraftBoardPage?leagueId=${leagueId}`;
  }

  const teamDetailMatch = normalized.match(TEAM_DETAIL_PATH);
  if (teamDetailMatch) {
    const [, sportSegment, teamId] = teamDetailMatch;
    // Two mismatches at once. The segment is PLURAL on web
    // (`apps/web/src/app/app.tsx`'s `/football/teams/:teamId`) and SINGULAR on
    // native (`apps/app/src/app/(app)/football/team/[teamId].tsx`), and the
    // football screen puts its `RosterBoard` lineup editor on a non-default
    // `Lineup` tab while web renders the board as the page itself. Baseball's
    // native team screen already opens on `Lineup` (its first tab), so only
    // football needs the tab named.
    return sportSegment === 'football'
      ? `/football/team/${teamId}?initialTab=Lineup`
      : `/baseball/team/${teamId}`;
  }

  const tabMatch = normalized.match(LEAGUE_TAB_PATH);
  if (tabMatch) {
    const [, sportSegment, leagueId, tab] = tabMatch;
    // The regex alternation guarantees this, but narrow the type rather than
    // assert it away.
    if (!isSport(sportSegment)) {
      throw new UnmappedNativeRouteError(
        path,
        `unknown sport "${sportSegment}"`,
      );
    }
    const sport = sportSegment;
    if (!VALID_LEAGUE_TABS[sport].has(tab)) {
      throw new UnmappedNativeRouteError(
        path,
        `"${tab}" is not a known ${sport} league tab (valid: ${[
          ...VALID_LEAGUE_TABS[sport],
        ].join(', ')})`,
      );
    }
    return `/${sport}/league/${leagueId}?initialTab=${tab}`;
  }

  return normalized;
}
