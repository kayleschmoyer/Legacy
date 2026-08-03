# Draft Spectator (Watch) Page — Reference

**Route**: `/baseball/league/:id/draft/watch` (web) · `(app)/baseball/league/[id]/draft-watch` (native)
**Files** (planned): `apps/web/src/components/EliteDraftSpectator.tsx` · `lib/shared-components/src/features/elite-draft/SpectatorScreen.tsx` (+ `.native.tsx`)
**Jira**: epic LS-8938 · design ticket LS-8941 · implementation LS-8942/LS-8943/LS-8944

---

## Purpose & Audience

A **read-only, big-screen-first** view of a live draft. Two audiences:

1. **Spectators** — signed-in users who are _not_ league members, allowed when the commissioner has set the league public (`league.isPublic`). No anonymous access.
2. **The room** — league members casting this page to a TV/projector at an in-person draft. Think ESPN's live NFL draft coverage: board, clock, on-the-clock team, and a celebratory reveal for every pick.

**No interactive draft controls of any kind.** No search, no queue, no draft buttons, no commissioner tools, no chat. The page never issues mutations (including `nudgeExpiredDraftPick` — the clock simply waits at 0:00 until the server advances the pick).

Design should assume the primary canvas is a **large landscape display (1280px+, often a TV)**; mobile (375px) is the secondary layout used by spectators following along on a phone.

---

## Full-Page State Screens (shown instead of main layout)

| State                                                   | Screen                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Initial load                                            | Loading skeleton mirroring the board layout                                                                            |
| League not found                                        | Error screen                                                                                                           |
| Private league + non-member (Forbidden)                 | "This draft is private" screen — no league details leaked, link back to home                                           |
| Draft not started (`draftStatus: not-started`/`queued`) | Countdown/lobby: league name, scheduled time if set, draft order if known                                              |
| Draft complete                                          | Final-board celebration state — full grid, "Draft Complete" banner                                                     |
| Auction draft                                           | Same layout; data refreshes by polling (~5s) instead of push — no design change, but pick reveals may arrive in bursts |

---

## Main Layout (live draft)

Three regions: **Top Band** (full width) · **Draft Board** (main, dominant) · **On-the-Clock Rail** (side panel; stacks below board on mobile). A **Pick Splash** overlay sits above everything when a pick is revealed.

### Top Band

- League name + "LIVE" indicator (animated dot) or "PAUSED"
- Current pick context: "Pick #{overall} · Round {round}"
- **Draft clock** — circular timer, MM:SS, color zones: safe (green) / warning < 30s (gold) / critical < 10s (red). Shows "∞" for untimed drafts. At 0:00 holds at zero (label like "TIME") — never negative.
- **On the clock**: team name + logo/avatar prominently displayed — this is the "who's up" headline of the page
- Optional: "up next" strip showing the next 2–3 teams in pick order

### Draft Board (center, the star of the page)

Same information as the existing draft-room board grid (`DraftGrid`): columns = teams (in draft order), rows = rounds, cells = drafted player (name + position, position-color coded). Additions for spectator scale:

- On-the-clock column highlighted; current empty cell visually "waiting"
- Most recent pick cell gets a settle-in emphasis after its splash completes
- Must remain legible from across a room at TV distance — bigger type than the member draft room

### On-the-Clock Rail

- **Team depth chart** for the team currently picking: position slots (C, 1B, 2B, 3B, SS, OF, P), filled vs open, players drafted so far by that team
- Positional needs at a glance (e.g., open slots emphasized)
- **Recent picks list**: last ~5 picks (pick #, team, player, position badge)

### Pick Splash (overlay, the signature moment)

Full-screen takeover when a pick is made — the ESPN "with the Nth pick…" moment:

- Player headshot (MLB photo; a dignified silhouette placeholder when unavailable)
- Player name (display type, big), position badge, MLB team
- "Pick #{overall} · Round {round}, Pick {roundPick}" + drafting fantasy team name
- **Stat line**: 3–5 key season/career stats (batting: AVG/HR/RBI/OPS; pitching: W/ERA/WHIP/K), `tabular-nums`
- Optional one-line commentary ("Great value in round 6…")
- Celebration treatment (existing room uses confetti) — should feel like a broadcast graphic, not a casino

**Queue behavior (critical, design for it):** splashes are FIFO-queued so every pick gets guaranteed screen time even when picks land seconds apart.

| Condition             | Behavior                                                 |
| --------------------- | -------------------------------------------------------- |
| Normal                | Each splash holds ~8s, then exits; next in queue enters  |
| Catch-up (queue > 3)  | Splash duration compresses to ~4s                        |
| Flood (queue > 8)     | Oldest dropped; only newest 3 shown                      |
| Page opened mid-draft | Historical picks are NOT replayed; only new picks splash |

A subtle queue indicator (e.g., "+2 more picks") may show during catch-up so the room knows reveals are behind live.

---

## Access Rules

| Viewer                                 | Result                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Signed-out                             | Standard auth redirect (page is not public-path)                           |
| Signed-in league member                | Full spectator view                                                        |
| Signed-in non-member, `isPublic: true` | Full spectator view (no invite code, no member-only data anywhere on page) |
| Signed-in non-member, private league   | Forbidden state screen                                                     |

---

## Real-Time Behavior

- WebSocket (`useDraftWebSocket`) push for: pick made (includes next pick + new deadline), draft paused/resumed, draft completed, pick undone.
- Poll fallback (~5s, existing `getCurrentDraftPick` behavior) covers reconnects and auction drafts.
- Pick-undone: remove the cell; if the undone pick's splash is still queued, drop it from the queue.
- Paused: dim board, "DRAFT PAUSED" banner, clock hidden/frozen — mirrors the member room's paused overlay but with no resume affordance.

## Data (all read-only, existing operations)

| Data                | Source                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| League + status     | `useGetLeagueByIdQuery` (includes `isPublic`, `draftStatus`)                    |
| Draft metadata      | `useGetLeagueDraftQuery` (mode, pick time limit, deadline)                      |
| Current pick        | `useGetCurrentDraftPickQuery` (~5s poll)                                        |
| All picks           | `useGetDraftPicksQuery`                                                         |
| Teams + draft order | `useGetLeagueTeamsQuery`, draft team order query                                |
| Depth chart         | `leaguePositions` + team members/picks for on-clock team                        |
| Player stats        | `GetDraftPlayerStats` / `GetDraftPitchingStats`                                 |
| Headshot            | Client-side URL from `player.mlbPlayerId` (img.mlbstatic.com), onError fallback |

**Never fetched on this page**: my draft queue, draft recommendations, auto-pick statuses, invite code, chat. **No mutations.**

---

## Brand Notes for the Design Session

This page is the purest expression of the brand's emotional goal — **"anticipation right before draft picks start."** Broadcast-desk energy, not dashboard energy.

- Palette per `PROMPT.md`: navy layers `#0A0F1A → #16223A`; `BRAND_GOLD #C5A55A` reserved for the pick reveal and on-the-clock emphasis (a pick IS the positive outcome); `BRAND_SEAM_RED #C41E3A` only for critical clock (<10s) and error states; `BRAND_NAVY #1B3A5C` for the rare interactive element.
- Big Shoulders Display for the scoreboard-scale headlines (player name on splash, on-the-clock team); Literata for supporting copy; `tabular-nums` on every stat and the clock.
- Banned: cyan/purple/neon, gradient text, >1px side accent stripes, generic uniform card grids.
- Motion (annotate, don't implement): splash enter/exit ~300ms ease-out-quart; clock zone-color crossfade 140ms; board cell settle-in after splash; skeleton shimmer. Honor `prefers-reduced-motion` (crossfades only).
- States to include in the mockup's switcher: loading skeleton, forbidden (private league), pre-draft countdown, live (populated), splash-active, splash catch-up (queue indicator visible), paused, complete. Both 1280px (primary, TV-first) and 375px layouts.
