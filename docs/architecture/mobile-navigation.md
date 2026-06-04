# Mobile Navigation Architecture

> **Status:** Accepted design — implementation tracked under [LS-7735](https://bkrupa.atlassian.net/browse/LS-7735) and its child tickets.
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

| Old drawer item                                                             | New home                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Home                                                                        | **Home** tab                                                       |
| Player Statistics / Compare Players                                         | **Players** tab (segments)                                         |
| Football Players                                                            | **Players** tab (sport filter — de-duplicated)                     |
| Baseball / Football "Home"                                                  | **Leagues** tab (sport is an attribute)                            |
| Create / Join League (×baseball, ×football)                                 | **Leagues** tab → unified, sport-aware Create / Join (4 items → 2) |
| Browse Leagues                                                              | **Leagues** tab action / empty state                               |
| Free Agents, Trade Center, Messages, Draft Board, Management, Matchup, Team | **League context** (tabs inside a league)                          |
| Minigames, Season Draft Games, Who Am I?                                    | **Games** tab                                                      |
| Notifications, Preferences, Profile, Help, About, Billing, Update check     | **You** tab                                                        |
| View Game Logs, View Career Stats                                           | **Removed** (dev utilities)¹                                       |
| Logout                                                                      | **You** tab                                                        |

¹ If "Career Stats" turns out to be a genuine user feature rather than a dev utility, it folds into the **Player detail** screen as a career segment rather than returning to global nav.

## Invariants

These hold regardless of future tab changes:

1. **Contextual content is never global navigation.** League-scoped features live inside the league-context screen.
2. **Sport is an attribute, not a navigation level.** No screen exists solely to pick a sport; sport is a filter/badge on unified screens, and a picker on Create/Join.
3. **The drawer is removed.** League onboarding (Browse/Join/Create) is an action on the Leagues tab.
4. **`Games` is the data-driven tab.** It is justified on engagement and instrumented accordingly; the frequency-justified tabs (Leagues, Players) are not.

## Relationship to the web app

The web app's _mobile_ layout (a bottom bar plus a grouped drawer) is the closest existing analog and informed the two-tier "primary bar + demoted secondary surface" split. Native intentionally diverges in two ways: it leads with **entity nouns** (Leagues/Players/Games as hubs) rather than web's research-first bar (Players/Stats/Minigames), and it pushes league-scoped features into a **league-context screen** that mirrors web's `/<sport>/league/:id/:tab` tab structure. Cross-platform users see a consistent league-detail model even though the top-level bars differ.

## Implementation plan

Implementation is intentionally **out of scope for the doc PR** and is sliced into child tickets under [LS-7735](https://bkrupa.atlassian.net/browse/LS-7735) so the app is never left in a half-migrated, broken state:

1. **Tabs layout** — introduce the `(tabs)` navigator with the five tabs; keep existing screens reachable during migration.
2. **Leagues hub + league-context screen** — the list-of-leagues hub and the tabbed league-context screen that absorbs the seven contextual items.
3. **Players segments** — fold Stats/Compare into segments; make sport a filter; remove "Football Players".
4. **Games tab** — minigames hub, Season Draft, "Who Am I?"; add engagement instrumentation.
5. **You screen** — consolidate account items; notifications badge on the tab icon.
6. **Unified Create / Join** — single sport-aware onboarding flow; remove the four duplicated entries.
7. **Drawer removal** — delete the flat drawer once all destinations have a home.

---

[← Back to Architecture Documentation](README.md)
