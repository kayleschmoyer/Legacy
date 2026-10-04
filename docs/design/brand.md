# Brand Guidelines

## Users

Fantasy sports players (25–45) who are league commissioners and active participants in baseball and football leagues. They use the app nights and evenings — often while watching live games. This is a passion and ritual, not a utility. They are competitive, data-obsessive, and have deep league loyalty.

**Emotional goal**: anticipation and excitement — the feeling right before draft picks start, when everything feels possible.

## Brand Personality

**Nostalgic, sporty, professional.** The confident voice of a seasoned beat reporter who still gets excited every Opening Day. Not flashy, not corporate, not casual. Heritage details (aged gold, deep navy) are earned — they appear at meaningful moments, not as wallpaper.

**Anti-reference**: Yahoo Sports — blocky, no craft, information dumped in uniform card grids. Every screen should have an editorial point of view.

## Typography

- **Display / Headings**: Big Shoulders Display (condensed grotesque — scoreboard, pennant, vintage baseball program energy)
- **Body / UI**: Literata (reading-optimized, editorial warmth — not a tech tool font)
- **Data**: tabular figures (`font-variant-numeric: tabular-nums`) for all statistics; numbers in columns must align on the decimal
- **Scale**: fixed `rem` steps for app/dashboard UI; fluid `clamp()` only for marketing/landing pages
- **Never use**: Inter, Playfair Display, Syne, or any font from the standard AI design reflex list

## Color Application Rules

- **Backgrounds**: layer `#0A0F1A` → `#0D1526` → `#111B2F` → `#16223A` (page → subtle → panel → elevated)
- **Accents** (use sparingly — these are earned moments, not decoration):
  - Heritage gold `#C5A55A` — match results, wins, trophy states
  - Seam red `#C41E3A` — critical alerts, losing states, action required
  - Deep navy `#1B3A5C` — primary interactive (buttons, selected states)
- **Text ramp** (on dark surfaces only):
  - `#F8FAFC` — primary body text
  - `#FFFFFF` — max-contrast headline text only
  - `#DEE6FF` — secondary text
  - `#9CAAC5` — muted metadata / labels
  - `#8296CA` — quietest tertiary text (helper text, small labels). Still meets WCAG AA (≥4.5:1) on every surface up to `#1C2A47` — every text tier must; use the dimmed disabled foreground `#3E4E71` only for genuinely disabled/inactive UI, never readable content
- **System-status hues** (semantic only — never decorative, never used for win/loss which stay gold/seam-red):
  - Success `#4AAE7C` — form validation, connection/sync status, positive system state
  - Warning `#C89452` — degraded state, non-critical alerts
  - Info `#5B84C4` — neutral system messaging
  - Each pairs with a soft-fill + border variant (see the Design System token file) for badges/toasts — the bright hex is for icon dots and accent strokes only.
- **Banned patterns**:
  - No `border-left` / `border-right` accent stripes wider than 1px on cards or callouts
  - No gradient text (`background-clip: text` with a gradient)
  - No cyan/purple/neon glow accents
  - No light-theme surfaces anywhere — the app is dark-mode only (see Layout Principles). This includes token files: no `.theme-light` / `[data-theme='light']` override block.

### Third-party brand exemption

Official third-party auth button treatments (Discord, Google, Apple, and similar OAuth providers) are **exempt** from the color and background rules above. Render them with the vendor's mandated brand colors and logo marks — e.g. Discord blurple `#5865F2`, Google's standard white button with grey border. Do not restyle vendor auth buttons to brand navy/gold: altering a mandated third-party mark undermines user trust and recognition, and often violates the vendor's own brand guidelines. The exemption is scoped to the button itself (fill, logo, label) — surrounding chrome (page background, card, headings) still follows brand rules above.

## Representative Data

- Mockups use fictional but plausible team names, league names, and user personas — never implying affiliation with a real league, organization, or person.
- **Exception — player-data surfaces**: this is a historical-baseball product whose actual domain data is real players. Pages whose product surface literally displays that data (players list/detail, stats tables, scoreboards, matchups) may use real historical MLB players (e.g. Babe Ruth, Mike Trout) as representative data — that data IS the product. Keep the fictional-data rule for anything adjacent that isn't player/stat data itself (invented team names, league names, commissioner personas, social/chat content).

## Navigation & Motion

- **Route transitions must have directional meaning**: drill-down slides in from right; back slides out to left; tab switches crossfade (parallel, not hierarchical)
- **Timing**: navigation 280–320ms ease-out-quart; micro-interactions 120–150ms
- **Animate only transform and opacity** — never width, height, padding, or margin
- **Honor `prefers-reduced-motion`**: crossfades only, no positional movement

## Layout Principles

- **Progressive disclosure**: surface what matters now; hide secondary navigation behind deliberate action
- **Editorial hierarchy**: not everything is equal weight — a standings table and a player card are different, treat them differently
- **No generic card grids**: not every piece of content belongs in the same card template
- **Data is the product**: statistics tables should feel as designed as headlines — crisp, legible, visually weighted

## Responsive Principles

Narrowing the viewport is an editorial act, not a scaling one. A phone is not a small desktop; it is the same product with less room, and what it gives up should be a decision rather than a side effect.

- **Chrome shrinks before content**: tab bars, pagers, headers, and card padding surrender space first. The data the user came for shrinks last. Desktop padding on a narrow column reads as waste, not generosity.
- **Hit areas are decoupled from visual size**: a control may look small; it may never be small to a thumb. 44×44px minimum interactive box at every width. Density is never bought with missed taps.
- **Cut repeated content, don't just tighten it**: below phone width, tightening stops working and the honest move is to show less. A fact that is constant across a surface's tabs belongs in one place on that surface, not in every tab's header.
- **One layout, many widths**: a narrow desktop window and a phone are the same viewport and get the same layout. Never branch on platform — see [shared-components architecture](../architecture/shared-components.md).

Implementation — tier table, density ladder, touch-target pattern, and per-tier checklists: [`.agents/skills/ui/references/responsive-density.md`](../../.agents/skills/ui/references/responsive-density.md).
