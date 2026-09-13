> [!WARNING]
> **Partly superseded. Do not run `/implement-design` against this bundle as a whole.** (LS-10161, 2026-09-13)
>
> The September Claude Design Draft Board bundle, [`docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/`](../../B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/) (`project/DraftRoomMobile.html`, phone option E), is canonical for the phone draft room wherever the two specs overlap. It was implemented under epic LS-9999.
>
> **Replaced — do not reintroduce:**
>
> | v2 element | Replaced by | Ticket |
> | --- | --- | --- |
> | **Board** tab (rounds × teams grid) | Round view: round tabs over a tile grid (`DraftRoundBoard`) | LS-10000 |
> | **Players** tab | Slide-up pick sheet holding the player list (`DraftPickSheet` → `DraftPlayersTab`) | LS-10002 |
> | **Team** tab | Persistent squad strip that opens a squad sheet (`DraftTeamTab`) | LS-10001 |
>
> The five-tab bottom nav (Board · Players · Queue · Team · Chat) is now **Board · Queue · Chat**, and its Board tab shows the round view.
>
> **Still shipping from v2** (phone tier of `EliteDraftBoardScreen.tsx`). The September phone page is silent on most of these, so this README remains their spec:
>
> - On-the-clock header band (`DraftHeaderBand`)
> - Last-pick ticker (`DraftLastPickTicker`)
> - My-pick splash with celebration (`DraftMyPickSplash`). The September page also specifies a my-pick announcement card; the shipped splash is the v2 one.
> - AI-pick toast (`DraftPickToast`)
> - Queue tab (`DraftQueueTab`)
> - Chat tab (rendered when the host passes a chat renderer; otherwise a placeholder)
> - Draft-complete recap (`DraftRoomRecap`, phone only)
> - Board · Queue · Chat bottom nav (`DraftBottomNav`)
>
> **Known conflict, unresolved:** the September phone page has no bottom nav. It puts Players · Queue · History tabs inside the pick sheet. The shipped Board · Queue · Chat nav comes from v2. Which spec wins is tracked in LS-10165. Until that is decided, do not change the phone nav from either bundle.
>
> Everything below is the original August handoff, unedited.

# Handoff: Mobile Draft Room v2 (ESPN × Sleeper hybrid)

## Overview
A redesign of the Legacy Sports mobile live-draft room (the compact branch of `EliteDraftBoardScreen`). It combines a Sleeper-style **board-first** draft room with ESPN's **inline "YOUR PICK" markers**, on the existing Legacy Sports navy/gold dark theme. Five tabs: Board, Players, Queue, Team, Chat, plus an on-the-clock header band, last-pick ticker, AI-pick toast, my-pick splash with confetti, and a draft-complete recap.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the `bkrupa/legacy-sports` codebase** (React Native + Tamagui, `lib/shared-components/src/features/elite-draft/`) using its established patterns:
- Colors come from `@legacy-sports/design-tokens` (`colors.ts`) and `useDraftPalette()` — never hex literals in components.
- Position colors from `footballPositionBadges` / `getPositionColor(sport, pos)`.
- Badges via the shared `PositionBadge` component.
- Data/actions via the existing hooks (`useDraftQueries`, `useDraftActions`, `useDraftTimer`, `useDraftWebSocket`, `usePlayerData`, `useDraftUIState`) — this redesign is a new compact-branch view layer over the same hooks that power `CompactLiveDraftBoard`.
- Fonts: Tamagui `$heading` (Big Shoulders Display) and `$body` (Literata), already registered in `apps/app/src/app/_layout.tsx`.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final intent. Recreate pixel-perfectly using existing tokens/components. The simulation logic (AI opponents, fake chat) exists only to demo the prototype — production uses the real WebSocket/GraphQL hooks.

## Files
- `Draft Room v2.dc.html` — the new interactive prototype (open in a browser; the draft runs live, you pick 5th of 8).
- `Draft Room — Current (Recreation).dc.html` — faithful recreation of today's `CompactLiveDraftBoard`, the baseline being replaced.

Phone canvas: 390 × 844. All measurements below are CSS px at that size.

---

## Design Tokens (from `lib/design-tokens/src/lib/colors.ts`)
- Background `#0A0F1A` · surfaceSubtle `#0D1526` · surfacePanel `#111B2F` · surfaceCard `#16223A` · surfaceRaised `#1C2A47`
- Outlines: subtle `#1C2740` · default `#2F3B53` · strong `#4D5D80` · panelBorder `#1F2D48`
- Text: fg1 `#F8FAFC` · fg3/muted `#9CAAC5` · fg4/faint `#6C80BA`
- Brand gold `#C5A55A` · goldLight `#D4BB78` · goldDark `#A68B3E` · accent ink on gold `#151515` (`accentInk`)
- Danger fg `#E07A8C` · success fg `#6FD39A`
- Football position colors (`footballPositionBadges`): QB `#C41E3A`, RB `#8B6F47`, WR `#2D6A4F`, TE `#7C8794`, FLEX `#C49A6C`, K `#C5A55A`, DST `#5B7FA6` (IDP steel blue used for D/ST slot in this design), BN neutral `#4D5D80`
- Radii: chips/pills 999, cards 12, board cells 8, sheet 18. Spacing follows the 4/8/12/16/20 scale.
- Alpha tints via `withAlpha()`: badge backgrounds 0.14–0.18, filled board cells 0.32 (0.5 in my column), chip active fills solid.

## Typography
- Headings/numerals: **Big Shoulders Display** 700/800 (`$heading`) — clock 26px/800, board round labels 12px/800, DRAFT button 12px/800 ls 1, splash name 30px/800, recap title 38px/800.
- Body: **Literata** — player names 13.5–15px/600, stat lines 9.5–11.5px, eyebrows 9.5–10px/700 uppercase, letter-spacing 2–2.5px.

---

## Screens / Views

### 1. Header band (persistent)
- Height ~64px, padding 10px 14px. Default: bg `#111B2F`, bottom border `#1C2740`.
- **On my pick:** bg `linear-gradient(135deg,#C5A55A,#A68B3E)`, border `#D4BB78`, all ink flips to `#151515` (dims at 65% opacity).
- Left: "Exit" 12px/600. Center: eyebrow ("ON THE CLOCK" / "YOU'RE ON THE CLOCK!") + clock `0:SS` 26px Big Shoulders; at ≤10s on my pick the clock scales-pulses (`clockBreath` 1s). Right: "RD n · PICK n" 9.5px + on-clock team name 14px/800 (ellipsized, max 110px).
- **Auto-pick hint** (my pick only): centered 11px strip inside the band, `rgba(0,0,0,.14)` bg, radius 6 — "Auto pick would be **{top queued player}** · queue drafts first".

### 2. Last-pick ticker (persistent)
- 6px 14px row, bg `#0D1526`, bottom border `#1C2740`. "LAST" label 9.5px/700 fg4 + `"{r}.{p} — {Player}, {POS} ({Team name})"` 11px fg3, single line ellipsis.

### 3. Board tab (default home)
- Horizontally scrollable grid. Round gutter column 30px (label `R{n}` 12px/800 fg4 + snake direction arrow → / ← 10px `#4D5D80` — alternates per round).
- Header row: 26px circular team avatar with initials (2 letters, Big Shoulders 11px/800) + team name 9px/700. My column: gold-tinted avatar (`withAlpha(gold,.2)` bg, goldLight text, gold 0.6 border), name label "YOU" in goldLight. On-clock team's avatar border solid gold.
- Cells 92×56, radius 8, gap 4:
  - **Filled**: bg `withAlpha(posColor, .32)` (my column .5), border `withAlpha(posColor,.5)` (my column gold .55). Content: pick number `r.p` 8.5px/700 60% white, short player name (F. Lastname) 11px/700 max 2 lines, `POS · TEAM` 8.5px 65% white.
  - **Current**: gold border + pulsing 2px gold ring overlay (`ringPulse` 1.4s, opacity 1→.15). If mine: bg `withAlpha(gold,.22)`, text "MAKE PICK" goldLight — tapping navigates to the Players tab. Else "On the clock…" on `#111B2F`.
  - **Empty**: bg `#0D1526`, border `#1C2740` (my column `withAlpha(gold,.3)`), snake-correct pick number 8.5px `#4D5D80`.

### 4. Players tab
- Search input: `#111B2F` bg, `#1F2D48` border, radius 10, 9px 12px padding, 13px text.
- **Position chips with roster counts** (horizontal scroll): ALL, QB, RB, WR, TE, FLEX, DST, K. Pill radius 999, 5px 11px padding; label 11.5px/700 + count line `filled/total` 8.5px (counts read from my roster slots; ALL shows `picks/rounds`). Active: solid fill in position color (gold for ALL) with `#151515` ink; inactive: transparent, `#2F3B53` border, fg3 text.
- **Player rows** (card `#16223A`, border `#1F2D48`, radius 12, padding 9px 10px, 6px gap):
  - Queue star 30×30 tap target: ☆ `#4D5D80` / ★ goldLight on `withAlpha(gold,.12)`.
  - 34px position column: badge (pos color text on 0.16 tint, radius 5) + `TEAM (bye)` 8.5px fg4.
  - Name 13.5px/600 + stat line: `ADP n.n · PROJ n (gold, 700) · ROST n%` 9.5px, labels fg4 values fg3.
  - **DRAFT button** (only when I'm on the clock): gold pill, 10px 14px padding, Big Shoulders 12px/800 ls 1, ink `#151515`.
- **Inline YOUR PICK markers (ESPN)**: for my next two picks, a divider inserted after N players (N = picks until mine): 1px gold rules flanking a gold-outlined pill "YOUR PICK (R{r}, P{p})" 9.5px/700 ls 1 goldLight. Only shown with filter=ALL and empty search.

### 5. Queue tab
- Title "MY QUEUE · n" Big Shoulders 11px/800 ls 2 gold.
- Empty state: dashed `#2F3B53` border card, 12.5px fg4 copy explaining star-to-queue + auto-draft on expiry.
- Rows: rank numeral, position badge, name 14px/600, `TEAM (bye) · ADP · PROJ` 10px fg3, then ▲ ▼ ✕ buttons (32×32, `#2F3B53` border, radius 8; ✕ in danger `#E07A8C`). Drafted players drop out automatically.
- Behavior: on clock expiry during my pick, top un-drafted queued player is auto-drafted; queue else falls back to best available ADP.

### 6. Team tab
- Team switcher chips (horizontal): "MY TEAM" + other teams' initials; active = gold border + `withAlpha(gold,.15)` fill.
- Roster slot rows (border-bottom `#1C2740`): 44px slot badge (slot color 0.14–0.2 tint, 11px/800; readable fg derived by lightening the slot color — same intent as `lightenForContrast()` in design-tokens), then player name 14.5px/600 + meta `POS · TEAM · Bye n · Pick r.p` 10.5px fg3, PROJ numeral gold 16px right-aligned. Empty: italic "Empty" `#4D5D80`.
- Slots: QB, RB, RB, WR, WR, TE, FLEX, DST, K, BN (prototype uses 10 rounds; production reads league roster shape).

### 7. Chat tab
- Bubbles: max-width 75%, radius 14, 8px 12px padding, 13px text. Mine: right-aligned, `withAlpha(gold,.18)` bg, gold .45 border. Others: `#16223A` bg, `#1F2D48` border. Sender label 9px fg4 above each.
- Input row: pill input + gold SEND pill (ink `#151515`). Enter sends.
- Unread dot: 7px seam-red `#C41E3A` dot on the Chat tab icon when a message arrives while another tab is open; clears on open.

### 8. Bottom nav (persistent)
- 5 equal tabs on `#0D1526`, top border `#1F2D48`, ~56px tall. Icon 16px + label 9.5px/700; active goldLight, inactive fg4.

### 9. AI-pick toast (overlay)
- Appears top (under ticker) for ~1.9s per AI pick: card `#1C2A47`, border `#2F3B53`, radius 14, shadow `0 12px 32px rgba(8,12,20,.65)`, slide-down 0.25s. Position badge + eyebrow `PICK r.p · TEAM` (or `AUTO PICK ·`) 9px fg4 + player name 14px/700 + `#overall` numeral.

### 10. My-pick splash (overlay)
- Full-screen scrim `rgba(10,15,26,.82)`, card bottom-anchored: `#1C2A47`, gold border, radius 18, rises 48px/0.3s. 64px initials circle in position color, eyebrow "WITH PICK #n, YOU SELECT" 10px ls 2.5 gold, name 30px Big Shoulders, meta `POS · TEAM · Bye · Proj` 13px fg3.
- **Confetti**: ~26 pieces 7×11, radius 2, brand palette (`#C5A55A #D4BB78 #C41E3A #F8FAFC #2D6A4F #5B84C4`), fall 660px with 720° rotation over 1.6–2.6s, staggered ≤0.55s. Auto-dismiss ~2.8s or tap. Respect a celebration on/off setting.

### 11. Draft-complete recap
- Replaces the room. Eyebrow "LEGACY SPORTS · 2026", "DRAFT COMPLETE" 38px Big Shoulders, sub-line 12.5px fg3.
- Three stat cards (surfaceCard, radius 14): DRAFT GRADE (gold), PROJ PTS (white), ADP VALUE (+n, success green). Grade heuristic in prototype: sum of (overall − ADP) across my picks.
- "BEST VALUE" callout: `withAlpha(gold,.08)` bg, gold .4 border, radius 14 — best (overall − ADP) pick.
- Full roster list reusing the Team-tab slot rows.

## Interactions & Behavior
- Snake order; user is seat 5 of 8 in the prototype (production: real seat).
- Clock resets per pick; my-pick expiry drafts top of queue, else best ADP (mirrors existing auto-pick semantics in `useDraftTimer`/`useDraftActions`).
- Tapping the current board cell when it's my pick jumps to Players.
- Star toggles queue membership from any player row.
- Chips filter list by position (FLEX = RB/WR/TE); search filters by name/team; markers hidden while filtered/searching.
- All primary tap targets ≥30px; buttons ≥40px tall where space allows (44px preferred in production).

## State Management (production mapping)
- Draft state, picks, current pick, clock, queue → existing `useDraftQueries` / `useDraftTimer` / `useDraftWebSocket` / `useDraftActions`.
- New UI state: active tab, selected team (Team tab), position filter, search, unread-chat flag, toast/splash queues → extend `useDraftUIState`.
- Chat → existing league chat (`LeagueChatTab` data source) rendered in-room; unread flag from message events while tab ≠ chat.

## Settings surfaced in the prototype's Tweaks panel
- `homeTab`: 'board' | 'players' — which tab the room opens on (product decision / A-B).
- `clockSeconds`: 15–90 — pick clock (production: league setting).
- `celebration`: boolean — confetti on/off (maps to existing celebrate flag on `DraftPickAnnouncement`).

## Screenshots
`screenshots/` — one per tab: `01-board`, `02-players` (with inline YOUR PICK marker + roster-count chips), `03-queue`, `04-team`, `05-chat`. Captured live from the prototype; some show the gold "You're on the clock" header state.

## Assets
- No image assets. Icons are placeholder glyphs (▦ ☰ ★ ▤ ◗) — replace with the app's `@tamagui/lucide-icons` set (e.g. LayoutGrid, List, Star, ClipboardList, MessageCircle).
- Fonts: Big Shoulders Display + Literata (already in the app via expo-font; prototype loads them from Google Fonts).
