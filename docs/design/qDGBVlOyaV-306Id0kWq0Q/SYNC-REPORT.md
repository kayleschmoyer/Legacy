# Sync report: League Detail Page

**Design ID**: `qDGBVlOyaV-306Id0kWq0Q`
**Source**: `https://claude.ai/design/p/2e2f8052-6cc9-4fb0-9c5f-a353a7fa57ff`
**Synced at**: 2026-08-04T17:10:00.000Z
**Bundle hash**: `943abd19581657db297173da1d6749d1ebf15faec8d95d31ad0cab0c0651a188`
**Files**: 90
**Source**: `designsync-local` (LS-8974)

## LS-9906: Sub-660px narrow tier (2026-09-08)

LS-9418 (design-coverage audit) singled this bundle out: its own `league-styles.css` header
comment claimed a "fully designed 375px frame," but the `@media (max-width: 659px)` tier was
reused verbatim all the way down to 0px — nothing distinguished a 375px phone from a 650px
one, and the only override actually scoped below 659px was LS-9419's single `.ls-player-row`
fix at `@390`.

**Fix applied directly to this repo bundle** (same cloud-session constraint as LS-9091 above —
`DesignSync` is unavailable here; a follow-up local session should `/push-design` this and
`/pull-design` back to reconcile the source). `@media (max-width: 390px)` in
`league-styles.css` is now a genuine further density step, not just the player-row scoping:
page/hero padding, the hero heading, and the snapshot stat values all shrink one step further
than the `@659` tier, and the hero-meta grid's gap tightens. The LS-9419 player-row fix is
folded into this same block. Header comment tables in `league-styles.css` and
`project/CLAUDE.md` updated to describe the `@390` tier accurately instead of claiming the
`@659` tier alone was the "375px frame." `docs/design/manifest.json`'s `lastSyncedHash`
resynced via `node scripts/hash-design-bundle.mjs`.

## LS-9091: Breakpoints coverage fix (2026-08-09)

LS-9024 audited all synced design bundles against `docs/agents/pages/PROMPT.md`'s Breakpoints
checklist item and found this bundle non-compliant across all 9 files: `league-styles.css` used
invented reflow thresholds (1100/780/600/380px) with no canonical bands and no `BREAKPOINTS`
annotations anywhere in the bundle.

**Fix applied directly to this repo bundle**, not via the `DesignSync` write flow the skill
prefers for source-of-truth fixes: this session is a cloud session, and per the LS-9000 decision
`DesignSync` requires an interactive `/design-login` that cloud sessions cannot run (confirmed
here — `get_project` returned "DesignSync needs design-system authorization ... not available in
this environment"). Patching the bundle directly was the only way to close this ticket's ACs from
a cloud session. **A follow-up local session should `/push-design 2e2f8052-6cc9-4fb0-9c5f-a353a7fa57ff`
this fix up to Claude Design and then `/pull-design` to reconcile the source and the manifest hash**
— until then, Claude Design's copy still has the old invented breakpoints.

**Closed (2026-09-03)**: pushed `league-styles.css` and all 10 page/tab HTML files
(`League Detail.html` + the 9 `Tab *.html` files) to the Claude Design project via
`/push-design`. Source and repo are back in step.

- **`league-styles.css`** — reflow thresholds remapped from `1100/780/600/380px` to the canonical
  bands `979/859/799/659px` (each "one pixel below the next band's start," per
  `lib/design-tokens/src/lib/breakpoints.ts`: xs=660, sm=800, md=860, lg=980, xl=1120, xxl=1280).
  Header comment rewritten with the full band → tier → frame table; each `@media` block gets a
  `BREAKPOINTS:` comment stating which bands it serves. lg/xl/xxl (980px+) share the undecorated
  base layout — annotated as the fully designed desktop frame (xxl, 1280px). xxs (0–659px) is the
  fully designed 375px frame (all four override tiers combined).
- **All 9 `Tab *.html` / `League Detail.html` files** — added a consistent head-level
  `<!-- BREAKPOINTS: ... -->` comment summarizing the band → tier mapping and pointing to
  `league-styles.css`'s header for the full breakdown.
- **`Tab Roster.html`** — the only file with an interactive breakpoint-preview toolbar
  (`VIEWPORTS`/`tierFor`/`TIER_NOTES`). Previously covered 5 invented tiers (xs=390, sm=600,
  md=834, lg=1100, xl=1280) missing 2 of the 7 canonical bands entirely. Rebuilt to preview all
  seven canonical bands at their min-width thresholds (xxs=375 reference device, xs=660, sm=800,
  md=860, lg=980, xl=1120, xxl=1280), with `tierFor`/`TIER_NOTES` matching the CSS coverage table.

## What changed vs. previous sync (2026-05-20)

This is a **mechanical-fix-only** partial re-sync, not the full "re-run" the parent ticket
calls for. Scope: agent-safe fixes only — banned purple accent, oversized position-color
border stripes, off-palette hex, and missing focus states. All other drift called out in the
LS-8954 audit (9-tab content, WebSocket states, shared TradingCenter, mobile Guided Home, no
375px mockup, loading/error states, heading hierarchy, self-hosted-font choice) is **not**
addressed here and remains for the human-led Claude Design re-run.

Fixed at the source (`DesignSync` write flow) and pulled back into this bundle:

- **`league-styles.css`**
  - Removed `.ls-avatar.purple` (banned purple gradient `#4A3F6B → #7C6CAE`).
  - `.ls-player-row` border-left width `4px → 1px` (brand rule: no accent stripe wider than 1px)
    — cascades to every position-color variant (baseball + football).
  - Football DEF/FLEX position colors were purple-family hex (`#4A3F6B` / `#7C6CAE`, both the
    border-left variant and the `.ls-pchip` badge variant) — remapped to existing brand tokens
    `var(--pos-catcher)` (steel) and `var(--info)` (muted sky) respectively.
  - `.ls-chip-active` / `.ls-chip-queued` used raw off-palette Tailwind hex (`#22C55E`, `#F59E0B`)
    — replaced with the brand `--success-*` / `--warning-*` token set.
  - Raw hex duplicating existing tokens (`#6FD39A` ×3, `#2D6A4F` ×4) replaced with `var(--success-fg)`
    / `var(--pos-outfield)` references.
  - Added a brand-compliant `:focus-visible` rule (`outline: 2px solid var(--focus-ring)`) — the
    bundle had zero focus-visible treatment on any interactive element (hover-only).
- **`TabTeam.jsx`** — removed `'purple'` from the `AVATAR_OPTS` picker (the banned color was a
  user-selectable team avatar option).
- **`Shared.jsx`** — `AVATAR_TONE.flex` mapped to `'purple'` (mini player-row avatar); remapped to
  `'navy'` now that the purple avatar variant no longer exists in CSS.
- **`TabMatchup.jsx`**, **`TabStandings.jsx`** — same off-palette Tailwind green (`#22C55E`) found
  duplicated in inline styles outside `league-styles.css`; fixed at the source but **not yet
  reflected in this local bundle pull** (see Known gaps below).
- **Bot-review round 1 (`TabTeam.jsx`)** — three more `#6FD39A`/`#E63950` raw-hex instances
  (the "Saved" checkmark and the primary/secondary hex-validation checkmarks) missed on the
  first pass; replaced with `var(--success-fg)` / `var(--brand-seam-red-light)`.

## Known gaps in this partial sync

- `TabMatchup.jsx` and `TabStandings.jsx` were fixed at the Claude Design source but this bundle
  still has their pre-fix content (cost/scope tradeoff — re-run `/pull-design` for a full pull).
- The 10 `Tab *.html` static exports and the `ds/`, `screenshots/` binary assets were **not**
  re-fetched — this hash was computed over the local tree as of this partial write, not a true
  file-for-file mirror of the live project. A full `/pull-design` (or the human-led re-run) is
  still required to bring the HTML exports and any other drifted files current.
- Everything in the LS-8954 audit's MED/LOW buckets (no loading/error states, invented
  max-widths + no 375px design, raw hex in JSX/HTML beyond what's listed above, heading hierarchy
  h1→h3, self-hosted fonts + JetBrains Mono, unused light-theme block) is untouched — explicitly
  out of scope for this mechanical pass per LS-8974.

## All files

```
league-detail-page/README.md
league-detail-page/chats/chat1.md
league-detail-page/chats/chat2.md
league-detail-page/chats/chat3.md
league-detail-page/chats/chat4.md
league-detail-page/project/Data.jsx
league-detail-page/project/DataFootball.jsx
league-detail-page/project/Icons.jsx
league-detail-page/project/League Detail.html
league-detail-page/project/LeagueDetailPage.jsx
league-detail-page/project/LeagueHero.jsx
league-detail-page/project/Shared.jsx
league-detail-page/project/Tab Commish.html
league-detail-page/project/Tab Free Agents.html
league-detail-page/project/Tab History.html
league-detail-page/project/Tab Matchup.html
league-detail-page/project/Tab Overview.html
league-detail-page/project/Tab Roster.html
league-detail-page/project/Tab Standings.html
league-detail-page/project/Tab Team.html
league-detail-page/project/Tab Trades.html
league-detail-page/project/TabCommish.jsx
league-detail-page/project/TabFreeAgents.jsx
league-detail-page/project/TabHistory.jsx
league-detail-page/project/TabMatchup.jsx
league-detail-page/project/TabOverview.jsx
league-detail-page/project/TabPageShell.jsx
league-detail-page/project/TabRoster.jsx
league-detail-page/project/TabStandings.jsx
league-detail-page/project/TabTeam.jsx
league-detail-page/project/TabTrades.jsx
league-detail-page/project/ds/assets/favicon.ico
league-detail-page/project/ds/assets/logo.png
league-detail-page/project/ds/colors_and_type.css
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin.woff2
league-detail-page/project/ds/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-cyrillic-ext.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-cyrillic.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-greek-ext.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-greek.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-latin-ext.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-latin.woff2
league-detail-page/project/ds/fonts/Literata-italic-400-vietnamese.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-cyrillic-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-cyrillic.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-greek-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-greek.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-latin-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-latin.woff2
league-detail-page/project/ds/fonts/Literata-normal-400-vietnamese.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-cyrillic-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-cyrillic.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-greek-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-greek.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-latin-ext.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-latin.woff2
league-detail-page/project/ds/fonts/Literata-normal-600-vietnamese.woff2
league-detail-page/project/ds/icons/brand/award.svg
league-detail-page/project/ds/icons/brand/baseball.svg
league-detail-page/project/ds/icons/brand/bell.svg
league-detail-page/project/ds/icons/brand/commissioner.svg
league-detail-page/project/ds/icons/brand/draft.svg
league-detail-page/project/ds/icons/brand/football.svg
league-detail-page/project/ds/icons/brand/league.svg
league-detail-page/project/ds/icons/brand/live.svg
league-detail-page/project/ds/icons/brand/matchup.svg
league-detail-page/project/ds/icons/brand/roster.svg
league-detail-page/project/ds/icons/brand/scoreboard.svg
league-detail-page/project/ds/icons/brand/secure.svg
league-detail-page/project/ds/icons/brand/standings.svg
league-detail-page/project/ds/icons/brand/stats.svg
league-detail-page/project/ds/icons/brand/trophy.svg
league-detail-page/project/ds/icons/brand/zap.svg
league-detail-page/project/league-styles.css
league-detail-page/project/screenshots/01-bb-roster.png
league-detail-page/project/screenshots/01-fb-roster.png
league-detail-page/project/screenshots/01-football-overview.png
league-detail-page/project/screenshots/02-bb-roster.png
league-detail-page/project/screenshots/02-fb-roster.png
league-detail-page/project/screenshots/02-football-overview.png
league-detail-page/project/screenshots/fb-fa.png
league-detail-page/project/screenshots/football-full.png
league-detail-page/project/screenshots/football-overview.png
```
