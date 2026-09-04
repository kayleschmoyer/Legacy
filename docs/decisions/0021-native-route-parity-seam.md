# 0021. Native route-parity seam: a driver-level translation table for tab-addressed routes

Date: 2026-09-04

## Status

Accepted (amends [0016 — Test dependency injection](0016-test-dependency-injection.md)
and [0018 — AppiumNativeDriver](0018-appium-native-driver.md))

## Context

ADR-0016's platform seam rests on a stated premise: "the mobile app uses
expo-router, so app routes are URL-shaped on both platforms." ADR-0018
repeats it as fact for `AppiumNativeDriver.open()`: `open('/baseball/league/7/draft')`
"opens `legacysports://baseball/league/7/draft`... mirroring the web driver
resolving the same path against `baseURL`."

That premise is false for every tab-addressed league screen:

- Web addresses a league tab by path segment —
  `apps/web/src/app/app.tsx` registers `/:sport/league/:id/:tab`, so
  `/football/league/1/roster` resolves to `LeagueDetailPage`.
- Native selects the tab from an `initialTab` **query param** on one screen
  route — `apps/app/src/app/(app)/football/league/[leagueId].tsx:106-108`
  (and the baseball counterpart). There is no `roster.tsx`, `matchups.tsx`,
  etc. under `apps/app/src/app`, and no catch-all/`+not-found` route to
  surface the mismatch loudly.
- League discovery has the same shape mismatch in miniature: web is
  sport-scoped (`/football/leagues`, `/baseball/leagues`, each its own
  `<Route>`), native is one sport-agnostic screen
  (`apps/app/src/app/(app)/league-discovery.tsx`).
- `/draft` and `/draft/watch` share the URL shape
  (`/:sport/league/:id/draft[/watch]`) but were never really "tabs" on
  either platform — web registers them ahead of the generic `:tab` route to
  dedicated screens (`EliteDraftBoardScreen`, `EliteDraftSpectatorScreen`),
  and native has dedicated top-level routes (`DraftBoardPage.tsx`,
  `DraftWatchPage.tsx`) that read `leagueId` from a query param, not a path
  segment.

Because `AppiumNativeDriver.open()` deep-linked whatever path a page object
passed, verbatim, every shared page object emitting one of these paths for
both platforms silently broke on native: `RosterPage.goto()`
(`apps/web-e2e/src/pages/roster.page.ts`) produced
`legacysports://football/league/1/roster`, a link matching no route.
`LeaguePage.gotoDiscovery()` and `DraftPage.gotoLeague()` — ADR-0016's own
DraftPage reference migration — had the identical defect. None of this was
caught by CI: the native lane silently skipped every real job and still
reported green (LS-9652, resolved ahead of this ticket) — see
`docs/decisions/0018-appium-native-driver.md`'s "watched" claim, which relied
on that lane actually executing.

Forces in tension (unchanged from ADR-0016, restated for this seam):

- **Page/component objects may carry no platform branch** (ADR-0016 §4,
  `.agents/skills/testing/SKILL.md:32`). `RosterPage.goto()` cannot special-
  case native.
- **Two designs were on the table:**
  1. Native route files (`app/(app)/football/league/[leagueId]/roster.tsx`,
     etc.) that redirect into the existing screen with the tab preselected —
     keeps the driver dumb, costs one file per addressable tab in app code
     that exists only to serve deep links.
  2. A driver-level route-translation table consulted in `open()` — keeps
     test concerns in the test layer; costs a second source of truth for
     routing that can drift from `apps/app`, and must fail loudly on an
     unmapped path rather than trade one silent break for another.

## Decision

Adopt **(2), the driver-level route map** —
`apps/web-e2e/src/driver/native-route-map.ts`, a pure function
(`resolveNativeRoute(path): string`, no wdio/driver import) consulted by
`AppiumNativeDriver.open()` before every deep link. The tab-and-discovery
surface is small (2 sports × ~9 tabs + 1 discovery screen + draft/draft-watch),
so one general pattern-based rule covers every current and future tab rather
than an enumerated per-tab table:

- **Tab-addressed league routes** — `/:sport/league/:id/:tab` →
  `/:sport/league/:id?initialTab=:tab`, gated on an explicit per-sport set of
  valid tab ids (mirroring each sport's `BASE_*_LEAGUE_TABS`, including the
  conditional `waivers` tab). A syntactically tab-shaped path naming a tab
  outside that set — a typo, a tab that exists on one sport but not the
  other (`history` is baseball-only), or a future web tab this table has not
  been updated for — throws `UnmappedNativeRouteError` with the bad path and
  the valid-tab list, before any deep link is attempted. This is the loud-
  failure requirement: no blank screen, no assertion timing out three lines
  later with no clue why.
- **Draft / draft-watch** — `/:sport/league/:id/draft[/watch]` →
  `/DraftBoardPage?leagueId=:id` / `/DraftWatchPage?leagueId=:id`. Matched
  _before_ the generic tab rule (the same path shape, one segment longer for
  `/watch`) since these are dedicated top-level native screens, never an
  `initialTab`.
- **Sport-scoped discovery** — `/:sport/leagues` → `/league-discovery`. The
  sport segment is dropped: native's discovery screen does not filter by
  sport today. That is a product gap, not this seam's to close (out of
  scope, matching the ticket's Out of Scope section), but this ADR names it
  so it isn't mistaken for latent behavior the mapping should have preserved.
- **Everything else passes through unchanged.** Most routes — `league/create`,
  `league/join[/:code]`, `players/:id`, `team/:id`, `matchup`, etc. — already
  have a 1:1 native file and needed no translation; the bug was specific to
  the shapes above, not universal, so a blanket allowlist/validation of every
  possible path was rejected as unneeded surface area for this ticket.

No page or component object changed. `RosterPage.goto(leagueId, sport)` and
`LeaguePage.gotoDiscovery(sport)` are byte-for-byte unchanged from before this
ADR — the seam lives entirely inside `AppiumNativeDriver`, which is exactly
the point of ADR-0016's platform seam: page objects speak a neutral path,
the driver decides what that means on its platform.

`RosterPage` (already `BaseScreen`/`AppDriver`-typed per ADR-0016, unmodified
by this change) is additionally wired into the dual-mode fixture set
(`apps/web-e2e/src/fixtures/dual.ts`) alongside `DraftPage`/`LeaguePage`/
`PlayersPage`, so any shared spec — present or future — can exercise it
against either platform. It was omitted from that fixture set before this
ticket, which is why AC2's route was never actually tested against a native
driver despite the page object being ADR-0016-migrated.

## Consequences

### Easier

- Every current tab-addressed screen (roster, matchups, trades, standings,
  history, chat, commissioner, waivers, free-agents) and both draft screens
  resolve correctly on native through the same shared page objects used on
  web, with zero page-object changes.
- A future new league tab is a one-line addition to
  `VALID_LEAGUE_TABS` in `native-route-map.ts` — not a new native route file,
  not a page-object platform branch.
- `native-route-map.test.ts` pins the translation table hermetically
  (`node:test`, no emulator), so a regression here fails in `pc-test`
  instead of on a scheduled device run days later.

### Harder

- The route map is a second source of truth for which tabs exist per sport,
  alongside `BASE_BASEBALL_LEAGUE_TABS`/`BASE_FOOTBALL_LEAGUE_TABS` in
  `apps/app/src/app/(app)/<sport>/league/[leagueId].tsx`. This is the
  accepted cost of design (2) named in the ticket's Technical Approach; the
  mitigation is that drift fails loudly (`UnmappedNativeRouteError`) rather
  than silently, so it surfaces on the next native run that touches the new
  tab rather than shipping unnoticed.
- League discovery's sport-scoping is now explicitly a **known, accepted**
  gap on native (the map documents it rather than papering over it) — a
  follow-up ticket, not this one, should decide whether native's discovery
  screen should filter by sport at all.

### Now constrained

- A new tab-addressed or dedicated-screen route on the web side must get a
  corresponding entry (or fall under an existing pattern) in
  `native-route-map.ts` before a shared spec can rely on it resolving on
  native — silence here is a thrown error, not a passing test with a blank
  screen behind it.
- `AppiumNativeDriver.open()` must keep routing every path through
  `resolveNativeRoute()` rather than reintroducing a raw
  `buildDeepLink(scheme, path)` call; that was the exact regression this ADR
  fixes.
