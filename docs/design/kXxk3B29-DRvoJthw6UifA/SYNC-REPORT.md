# Sync report: Player Details

**Design ID**: `kXxk3B29-DRvoJthw6UifA`
**Source**: `https://claude.ai/design/p/50ece563-1be9-47b1-842e-28d071cebe3f` (DesignSync, local)
**Synced at**: 2026-09-08T00:00:00.000Z
**Bundle hash**: `sha256-75b42740daf65a97fedd2f3fc76522b8740df14c076f60b7cdb302b18cb2447a`
**Files**: 15
**Total size**: 851695 bytes

## What changed (LS-9905)

Mechanical fix, follow-on from the LS-9418 responsive-design-coverage audit:
`player-detail.html`, `player-compare.html`, `player-stats.html` each had a
`@media (max-width: 900px)` rule driving the reviewer-only `.stage`
frame-stacking behavior (not a product breakpoint — see the `BREAKPOINTS`
comment above each rule, added in LS-8970). The LS-8970 pass documented that
this rule wasn't a product threshold but left the literal `900px` value
un-repinned; LS-9905's audit still flagged it as a non-canonical number, so
re-pinned all three to the canonical `lg` (980px) boundary —
`max-width: 979px` — matching the boundary the `BREAKPOINTS` comments already
describe (lg/xl share the desktop frame from 980px up). Comment text updated
to match. `index.html`'s `.wrap { max-width: 900px }` is an unrelated content
container width (not a `@media` breakpoint) and was left unchanged, consistent
with this bundle's prior sync noting `index.html` as already compliant.

## What changed (LS-8970)

Agent-driven DesignSync fix of the LS-8954 audit findings, applied at the source (Claude
Design project `50ece563-1be9-47b1-842e-28d071cebe3f`) then re-pulled here. Three of the four
mockups changed; `index.html` (the mockup-set index page) was already compliant.

**HIGH**

- `player-compare.html`: comparison slot accents `--slot-1/2/3` used off-palette/banned hex
  (`#60a5fa`, `#34d399` teal-banned, `#f87171`) — remapped to existing DS tokens
  (`navy-light` / `seam-light` / `fg-3`); no dedicated multi-series accent tokens exist yet,
  flagged as an open question in the file's `HANDOFF` comment.
- `player-detail.html`, `player-stats.html`: `--pos-outfield` used an off-palette green
  (`#2d6a4f`) — remapped to the existing `fg-3` token.
- `player-detail.html`, `player-stats.html`: error-card `<code>` declared `'JetBrains Mono'`,
  never loaded anywhere in the bundle — dropped, falls back to system `ui-monospace`.

**MED**

- All three: only two designed frames (xxs 375 / xxl 1280) with an undocumented reviewer-only
  `@media 900px` rule — added a `BREAKPOINTS` annotation clarifying that rule is the review
  harness's own frame-stacking behavior, not a product breakpoint, and documenting which
  canonical bands (660/800/860/980/1120) share which of the two designed frames.
- `player-detail.html`: `.portrait` avatar used a raw-hex gradient (`#1B3A5C`→`#C5A55A`)
  outside `:root` — now references `var(--navy)`/`var(--gold)`.
- All three: zero `:focus-visible` anywhere — added a global rule (`outline: 2px solid
  var(--fg-1)`) since gold is reserved for outcomes.

**LOW**

- All three: added `<!-- HANDOFF -->` blocks and `<!-- COMPONENT -->` annotations
  (`arc-card`, `comparison-table`, `slot-chip`) per the brief's Handoff Notes section.

## Shipped-UI content fold-in (LS-8970)

Per the ticket's own dispatch note ("agent-driven DesignSync fix is appropriate here"), the
following shipped-UI deltas were folded into `player-detail.html` since they were tractable
within the existing frame:

- Career Arc chart now has an accessible `<table class="sr-only">` fallback alongside the SVG
  (`COMPONENT: arc-card`).
- Entitlement-gated **premium** advanced batting columns (OPS / OPS+ / BABIP) added to the
  season table, rendered locked/blurred with an upgrade-prompt notice, matching the `.gate`
  pattern already used on `player-compare.html`.
- Football variant (FootballPlayerDetail) and several other deltas (routable/deep-linkable
  modal + external navigation, native back-gesture/pull-to-refresh, sortable + virtualized
  season tables, position-badge→roster-slot-picker links, two-way player handling) are
  documented as `SPORT VARIANT` / inline HTML comments rather than fully redesigned — flagged
  as a human-led follow-up per the ticket's own guidance, given the size of a full second-sport
  frame relative to this mechanical pass.

## Pages

- `legacy-sports-player-details/project/scratch/mockups/index.html`
- `legacy-sports-player-details/project/scratch/mockups/player-compare.html`
- `legacy-sports-player-details/project/scratch/mockups/player-detail.html`
- `legacy-sports-player-details/project/scratch/mockups/player-stats.html`

## All files

```
legacy-sports-player-details/README.md
legacy-sports-player-details/chats/chat1.md
legacy-sports-player-details/project/assets/logo.png
legacy-sports-player-details/project/scratch/debug/01-cmp-overflow.png
legacy-sports-player-details/project/scratch/debug/02-cmp-overflow.png
legacy-sports-player-details/project/scratch/debug/cmp-deep.png
legacy-sports-player-details/project/scratch/debug/cmp-probe.png
legacy-sports-player-details/project/scratch/debug/cmp-scroll.png
legacy-sports-player-details/project/scratch/debug/mobile.png
legacy-sports-player-details/project/scratch/debug/mobile2.png
legacy-sports-player-details/project/scratch/debug/overflow.png
legacy-sports-player-details/project/scratch/mockups/index.html
legacy-sports-player-details/project/scratch/mockups/player-compare.html
legacy-sports-player-details/project/scratch/mockups/player-detail.html
legacy-sports-player-details/project/scratch/mockups/player-stats.html
```
