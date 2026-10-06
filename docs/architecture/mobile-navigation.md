# Mobile Navigation Architecture

> **Status:** Implemented — tracked under [LS-7735](https://bkrupa.atlassian.net/browse/LS-7735) and its child tickets. The tab bar is the live navigation and the flat drawer has been removed (see [Implementation plan](#implementation-plan)).
> **Scope:** The native (Expo / React Native) app under `apps/app`. The web app is referenced as the comparison baseline but is not changed by this design.

## Summary

The native app organizes navigation as an **entity-noun bottom tab bar** of five stable destinations:

> 🏠 **Home** · 🏆 **Leagues** · 👤 **Players** · 🎮 **Games** · ⚙️ **You**

Everything that only has meaning _inside a league_ (matchups, rosters, free agents, trades, chat, commissioner tools) is **league context**, not navigation — it lives inside a league-context screen reached by tapping a league in the **Leagues** tab. The legacy flat drawer is removed.

## Motivation

The native app's navigation lived in a single flat drawer of 26+ items in `apps/app/src/app/(app)/_layout.tsx` (the `ROUTES` array, rendered by `CustomDrawerContent`). It had no sections, no hierarchy, and no expand/collapse — just one `XStack` row per route. That surface was a **feature list, not a navigation scheme**, and it conflated four different kinds of thing:

| Kind                      | Examples in the old drawer                                            | Problem                                                            |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Top-level destinations    | Home, Players, Minigames                                              | Buried in the least-visited surface (the drawer)                   |
| League-contextual actions | Free Agents, Trade Center, Messages, Draft Board, Management, Matchup | Meaningless without a league selected, yet presented as global nav |
| Sport-duplicated entries  | Create / Join / Players for baseball **and** football                 | Sport is an attribute, not a navigation level — doubled the list   |
| Dev utilities             | View Game Logs, View Career Stats                                     | Internal tools exposed as user navigation                          |

The drawer is the most out-of-the-way surface in mobile UX. Putting primary destinations there means they are effectively hidden, while the contextual and duplicated entries inflate it past the point of scanability.

## The organizing axis

A navigation bar can be organized on one of four axes:

| Axis              | Tabs become…                    | Best when…                                     |
| ----------------- | ------------------------------- | ---------------------------------------------- |
| **Entity / noun** | Leagues, Players, Games, Me     | The app is _about_ managing specific objects   |
| Activity / verb   | Research, Play, Compete, Social | Users arrive with an intent, not a destination |
| Context / "now"   | Home/Today + utilities          | What matters changes constantly                |
| Feature parity    | Whatever web has                | Consistency trumps everything                  |

We chose the **entity-noun axis**, with two deliberate constraints:

- **Not league-first.** Enshrining a single league as the home base breaks for our users: they are commissioners with **multiple** leagues (there is no single "the league"), leagues go **dormant in the off-season**, and the app is genuinely also a research tool and a games product. **Leagues** is therefore a _hub that lists all of the user's leagues_, not a single league.
- **Contextual content is not navigation.** Anything scoped to a league is reached _through_ a league, never from the global bar.

### The entity-noun test

A tab earns a slot only if it is a **collection of objects the user drills into**:

- **Leagues** → list of leagues → open one ✅
- **Players** → list of players → open one ✅
- **Games** → list of games → open one and play ✅ (structurally identical to the above)

`Home` is the conventional dashboard exception; `You` is the user entity.

## The five tabs

### 🏠 Home — cross-league aggregator

A season-aware activity surface, not a static page. In-season it surfaces the user's matchups **across all leagues**, lineup deadlines, recent trades/activity, and news. Off-season it re-themes toward draft prep, standings recaps, and games. Home answers _"what should I do right now"_; Leagues answers _"go manage something specific."_

### 🏆 Leagues — the league hub

Lists every league the user is in, **both sports, sport-badged**. The `+` / overflow action holds **Browse · Join · Create**, unified and sport-aware (one screen that asks the sport rather than separate baseball/football entries). Tapping a league opens the **league-context screen**.

### 👤 Players — research

The unified players list. **Stats** and **Compare** become a segmented control inside this tab rather than separate destinations. **Sport is a filter**, not a screen — there is no separate "Football Players" entry.

### 🎮 Games — minigames hub

Houses the minigames hub, Season Draft, and "Who Am I?". Unlike Leagues and Players, Games earns its slot on **discoverability/engagement** rather than frequency: casual content lives or dies by visibility, and a buried games hub gets scrolled past. This is the tab to **instrument** — if tap-through does not materialize, it is the first candidate to demote to a Home card. Leagues and Players are never on that chopping block.

### ⚙️ You — the user entity

Profile, Preferences, Notifications (with unread badge mirrored on the tab icon), Billing/Subscription, Help, About, Check for Updates (Android only), and Logout.

## League context (not navigation)

Tapping a league opens a tabbed league-context screen. This single move absorbs **seven** former drawer items and aligns native with the web app's existing `/<sport>/league/:id/:tab` route shape:

> **League →** Matchup · My Team / Roster · Players · Free Agents · Trades · Standings · Chat · Manage _(commissioner only)_

## Item mapping

Every current drawer entry has an unambiguous home in the new model:

| Old drawer item                                                         | New home                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Home                                                                    | **Home** tab                                                       |
| Player Statistics / Compare Players                                     | **Players** tab (segments)                                         |
| Football Players                                                        | **Players** tab (sport filter — de-duplicated)                     |
| Baseball / Football "Home"                                              | **Leagues** tab (sport is an attribute)                            |
| Create / Join League (×baseball, ×football)                             | **Leagues** tab → unified, sport-aware Create / Join (4 items → 2) |
| Browse Leagues                                                          | **Leagues** tab action / empty state                               |
| Free Agents, Draft Board, Matchup, Team, per-league Trades & Chat       | **League context** (tabs inside a league)                          |
| Messages (cross-league DMs), Management                                 | **You** tab rows — see ²                                           |
| Trade Center (cross-league)                                             | **Removed** — per-league Trades tab supersedes it ²                |
| Minigames, Season Draft Games, Who Am I?                                | **Games** tab                                                      |
| Notifications, Preferences, Profile, Help, About, Billing, Update check | **You** tab                                                        |
| View Game Logs, View Career Stats                                       | **Removed** (dev utilities)¹                                       |
| Revenue Analytics (admin)                                               | **Removed** from native — admin UI is web-only (LS-5739) ²         |
| Logout                                                                  | **You** tab                                                        |

¹ If "Career Stats" turns out to be a genuine user feature rather than a dev utility, it folds into the **Player detail** screen as a career segment rather than returning to global nav.

² **Cross-league screens.** The original mapping assumed Messages, Trade Center, and Management all collapsed into the per-league league-context screen. The drawer-removal audit found this only holds for the _per-league_ versions: the standalone screens were **cross-league** (cross-league DMs, a cross-league trade center, a global management hub). Resolution: **Messages** and **Management** are genuine global features and keep a home as **You** tab rows; the cross-league **Trade Center** was dropped because the per-league **Trades** tab is the better model and cross-league trading is niche; native **Revenue Analytics** was dropped to match the web-only-admin decision (the web admin screen remains; native nav and its native screen file are gone). The dropped screen files (cross-league **Trade Center**, native **Revenue Analytics**) and the dev utilities (**View Game Logs** / **View Career Stats**) — which slice 7 left as URL-only routes — have since been deleted as dead code.

## Invariants

These hold regardless of future tab changes:

1. **Contextual content is never global navigation.** League-scoped features live inside the league-context screen.
2. **Sport is an attribute, not a navigation level.** No screen exists solely to pick a sport; sport is a filter/badge on unified screens, and a picker on Create/Join.
3. **The drawer is removed.** League onboarding (Browse/Join/Create) is an action on the Leagues tab.
4. **`Games` is the data-driven tab.** It is justified on engagement and instrumented accordingly; the frequency-justified tabs (Leagues, Players) are not.
5. **Every screen has exactly one mount point.** A screen the tab shell hosts is never also reachable as a standalone route — see [One home surface](#one-home-surface). (A drill-down route in the shared per-tab group is still one route file at one URL; each tab's stack gets its own instance of it — see [Tab bar persistence](#tab-bar-persistence).)
6. **The tab bar persists on every drill-down screen.** Only modal / immersive tasks hide it. A new screen goes in the shared per-tab group unless it is a task the user finishes or cancels — see [Tab bar persistence](#tab-bar-persistence).

## Tab bar persistence

> **Decision (LS-10614):** stack-per-tab. Every drill-down screen opens _inside_ the current tab with the tab bar visible; only modal/immersive flows hide it.

This is the platform convention: Apple's HIG keeps the tab bar visible through a tab's drill-down hierarchy and hides it only for modal tasks, each tab keeps its own history, and re-tapping the active tab pops it to its root. React Navigation's recommended structure (a stack inside each tab) and comparable fantasy apps (ESPN, Sleeper, Yahoo) behave the same way. Before LS-10614 every non-root screen was pushed on the root `(app)` Stack above the tab navigator, so league detail, team, player and settings pages all hid the bar — and, being headerless (LS-8766), had no on-screen way back either.

### Route structure

```
app/(app)/
  _layout.tsx                          root Stack — anchor (tabs) + modal routes
  (tabs)/
    _layout.tsx                        Tabs: (home) (leagues) (players) (games) (you)
    (home)/home.tsx                    tab roots, one per group
    (leagues)/leagues.tsx  …
    (home,leagues,players,games,you)/  shared routes — drill-downs
      _layout.tsx                      the per-tab Stack (one file, five instances)
      football/league/[leagueId].tsx
      PlayerDetail.tsx  notifications.tsx  …
  league/create.tsx  DraftBoardPage.tsx  mock-draft/[draftId].tsx  …   modal routes
```

The `(home,leagues,players,games,you)` directory uses expo-router's **shared routes** (array-syntax groups): it expands into one copy per tab, so every drill-down route exists in all five stacks. Group segments never appear in the URL — `/football/league/42` is unchanged, so universal links, the post-login redirect and every existing `router.push` keep working. When a push matches several groups, expo-router prefers the currently focused one, so opening a league from Home stays in Home's stack and opening it from Leagues stays in Leagues'. A cold deep link (no focused group) resolves into Home.

### Which side a screen goes on

| Tab bar **visible** — shared per-tab group                                                                                                                                                                                          | Tab bar **hidden** — root `(app)` Stack                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| League detail, team, matchup, scoreboard, free agents, waivers, trades, players lists, player detail / stats / compare, messages, management, notifications, preferences, profile, help, about, mock-drafts hub, season-draft lobby | Draft board / watch, mock draft room + setup, create / join league (all variants), join-by-code, season-draft create / join / game, mini-games in play, subscription paywall |

The route-placement spec in `(tabs)/(home,leagues,players,games,you)/_layout.spec.tsx` pins both lists. The paywall is modal because it is opened mid-flow from Create League and Mock Draft; keeping it on the root Stack preserves the in-progress flow underneath.

### Leaving a modal

A plain `router.navigate`/`replace` from a root-stack screen into a tab-hosted route pushes a **second** copy of the tab navigator onto the root Stack, and — within the same tick — resolves the shared route into Home regardless of where it belongs. Root-stack screens therefore leave through `navigateFromModal(router, href)` (`common/utilities/RouteUtils`), which `dismissTo`s a group-qualified href (`/(tabs)/(leagues)/football/league/42`): the root Stack pops back to the one tab shell and the destination opens in its host tab. `tabHrefFor` holds the destination → host-tab mapping (league-scoped → Leagues, player research → Players, account → You, season-draft lobby → Games, everything else → Home). `closeToHomeTab`'s no-history fallback goes through the same path.

These behaviors — per-tab pushes, cold deep links landing in Home, modal routes outside `(tabs)`, and `navigateFromModal` leaving exactly one tab shell — are pinned against expo-router's real resolution by `common/utilities/RouteUtils.routing.spec.tsx` (LS-10639), which mounts a minimal route map of the same shape through `renderRouter` from `expo-router/testing-library`. The app's Jest config loads jest-expo's setup so `renderRouter` works in any spec.

## One home surface

> **Decision (LS-8823):** the sport home screens are **removed as standalone screens** in favour of the tab-hosted inline views. `/baseball` and `/football` survive only as **redirects into the Home tab**.

The Home tab mounts `BaseballHomeScreen` and `FootballHomeScreen` inline, switching between them with local state so scroll position and component state survive (LS-5814). Those same components were _also_ reachable as routes at `/baseball` and `/football`, outside the tab shell. Two shells rendering one screen is indistinguishable from two screens: cancelling out of Create League ran `router.navigate('/${sport}')` and dropped the user on a tab-bar-less copy of the home they had just come from, which read as a second home page.

The screens therefore live in `apps/app/src/screens/`, **not** under `apps/app/src/app/` — anything under the route tree is addressable, and being addressable is what created the duplicate. The Home tab is their only mount point.

The two paths are kept as redirects rather than deleted because they are live **universal-link targets**: `app.json` autoverifies every path on `legacy-fantasy.com` / `app.legacy-fantasy.com`, and the web app genuinely serves `/baseball` and `/football`, so a shared link would otherwise open the app on the unmatched-route screen. Each redirect forwards to `/home?sport=<sport>`; the Home tab consumes the param, opens that sport's inline view, and clears it.

Consequences for call sites:

| Intent                                     | Use                                                      | Not                                      |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------- |
| Cancel / close a pushed screen             | `closeToHomeTab(router)` (`common/utilities/RouteUtils`) | `router.navigate('/<sport>')`            |
| Go to the home surface outright            | `router.navigate(HOME_TAB_HREF)` (`/home`)               | `router.navigate('/')` — only a redirect |
| Leave a modal for a tab-hosted screen      | `navigateFromModal(router, href)` (`RouteUtils`)         | `router.navigate` / `router.replace`     |
| Switch the active sport                    | the host's `onSwitchSport` (inline state)                | `router.navigate('/<sport>')`            |
| Enter a deep screen from outside the shell | `router.replace(href, { withAnchor: true })`             | a bare `router.replace(href)`            |

That last row is what keeps the shell underneath a screen the user did not walk to. React Navigation defaults a cross-navigator navigation to `initial: true`, which means the target navigator's anchor is **not** loaded and the incoming screen becomes the sole entry in the `(app)` Stack. Because every route in that group is headerless (LS-8766), such a screen has no back button, no tab bar, and a `canGoBack()` of `false` — the Android back button quits the app. `withAnchor: true` loads the `(tabs)` anchor beneath the destination instead. The post-login redirect in `app/login.tsx` (deep link, or the last-visited league from LS-6694) is the entry point this applies to.

`(app)/index.tsx` remains a `<Redirect href="/home" />`; it is the post-login/logout landing for `router.replace('/')` and is not a home surface.

## Relationship to the web app

The web app's _mobile_ layout (a bottom bar plus a grouped drawer) is the closest existing analog and informed the two-tier "primary bar + demoted secondary surface" split. Native intentionally diverges in two ways: it leads with **entity nouns** (Leagues/Players/Games as hubs) rather than web's research-first bar (Players/Stats/Minigames), and it pushes league-scoped features into a **league-context screen** that mirrors web's `/<sport>/league/:id/:tab` tab structure. Cross-platform users see a consistent league-detail model even though the top-level bars differ.

## Implementation plan

Implementation is intentionally **out of scope for the doc PR** and is sliced into child tickets under [LS-7735](https://bkrupa.atlassian.net/browse/LS-7735) so the app is never left in a half-migrated, broken state:

1. ✅ **Tabs layout** — introduce the `(tabs)` navigator with the five tabs; keep existing screens reachable during migration.
2. ✅ **Leagues hub + league-context screen** — the list-of-leagues hub and the tabbed league-context screen that absorbs the seven contextual items.
3. ✅ **Players segments** — fold Stats/Compare into segments; make sport a filter; remove "Football Players".
4. ✅ **Games tab** — minigames hub, Season Draft, "Who Am I?"; add engagement instrumentation.
5. ✅ **You screen** — consolidate account items; notifications badge on the tab icon.
6. ✅ **Unified Create / Join** — single sport-aware onboarding flow; remove the four duplicated entries.
7. ✅ **Drawer removal** — the flat drawer is gone. `(app)/_layout.tsx` is now a `Stack` whose anchor is the `(tabs)` group; `(app)/index.tsx` redirects `/` → the Home tab so post-login `router.replace('/')` lands on the bar; the Home tab renders the shared cross-platform `HomeScreen` component (interim — the unified shared home/dashboard is tracked in LS-7791 under the shared-components-first principle, LS-7790); Messages/Management became **You** rows; Trade Center, Revenue Analytics, and the dev utilities were dropped from nav (see ²). All other destinations were pushed onto the Stack above the tabs — superseded by slice 8.
8. ✅ **Tab bar persistence (LS-10614)** — stack-per-tab via shared routes; drill-down screens keep the tab bar, modal flows hide it. See [Tab bar persistence](#tab-bar-persistence).

> **Slices 1–6 shipped only the tab _files_ — the `(tabs)` navigator was never actually wired in as the landing surface, so the flat drawer remained the only live navigation until slice 7.** Slice 7 is the integration step that made the tabs reachable.

---

[← Back to Architecture Documentation](README.md)
