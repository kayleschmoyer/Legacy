# Page Design Prompt — Legacy Sports Web App

> Load this file before designing any page in `apps/web/src/pages/`. It defines the design brief, visual standards, and deliverable format for mockup sessions. **No functional code is written here** — the output is a design artifact for a future implementation agent.

> **Maintenance note**: the Brand & Visual Identity, Color, Typography, Layout, and Motion sections below mirror [`docs/design/brand.md`](../../design/brand.md) (canonical). This file is uploaded standalone into Claude Design projects, where repo paths don't resolve, so it must stay self-contained — when brand rules change, update `brand.md` first, then re-mirror here. On any conflict, `brand.md` wins.

---

## Mandatory Pre-Read

Before designing anything, read:

1. **The design system** at https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb — the canonical source of truth for tokens, colors, typography, and component patterns. From cloud sessions fetch it via WebFetch; from local repo sessions use the DesignSync tool (project id above; see `.agents/skills/design-sync/references/designsync-tool.md`) or read the synced bundle under `docs/design/`. Plain URL fetching only works from claude.ai-authenticated environments.
2. **The brand guidelines** — `docs/design/brand.md` in the repo. If you are in a Claude Design session without repo access, the sections below mirror it. Every visual decision must be traceable back to the design system or the brand guidelines.
3. **The page's reference doc** in this directory (e.g., `home.md`, `scoreboard.md`). It defines the exact data model, conditional states, and route — use it to know what content must appear and under what conditions.

---

## What This Session Produces

The output is a **static HTML mockup**. In a Claude Design session, that is the project's HTML file; in a local repo session, write it to `scratch/mockups/<page-name>.html`. Either way it is a single self-contained `.html` file that must:

- Render correctly when opened directly in a browser (no build step, no server)
- Use only inline `<style>` blocks and vanilla `<script>` (no frameworks; no external dependencies except Google Fonts via CDN; inline images as SVG or data URIs)
- Contain representative but clearly fictional data (names, scores, stats)
- Cover every conditional state the page reference doc defines (loading skeleton, error, empty, populated, plus any page-specific states)
- Be annotated with design intent comments — not implementation notes

> **No React/Babel/other framework CDN scripts — this is not optional (LS-9909).** A handful of older bundles under `docs/design/` (e.g. Admin Console, Public Leagues, Draft Board) load React, ReactDOM, and Babel from `unpkg.com` via `<script>` tags. Do not treat them as precedent — they predate this rule and are non-conforming, not an exception to it. Agent sessions verify mockups from behind a network proxy that denies `CONNECT` to `unpkg.com` and most other CDNs (only Google Fonts is allowlisted); a mockup that loads a framework from any other CDN renders blank when an agent tries to visually verify it, silently defeating the AGENTS.md-mandated "use the feature in a browser before reporting complete" step. State-toggling and conditional rendering must be done with vanilla `<script>` (plain DOM APIs, `classList`, event listeners) — the state complexity these mockups need does not require React.

This file is a communication tool for handoff, not a code scaffold. **The implementation agent reads your HTML and CSS source directly — it does not render or screenshot the file.** Everything it needs (dimensions, colors, layout rules, states, intent) must be legible in the source itself.

---

## Brand & Visual Identity

### Personality

**Nostalgic, sporty, professional.** The voice of a seasoned beat reporter who still gets excited every Opening Day. Not flashy, not corporate, not casual.

**Anti-reference**: Yahoo Sports — blocky, no craft, information dumped in uniform card grids. Every screen needs an editorial point of view.

### Emotional Goal

**Anticipation and excitement** — the feeling right before draft picks start. Quiet energy: a player carefully marking his scorecard before first pitch.

---

## Color Palette

| Token            | Hex       | Use                                                     |
| ---------------- | --------- | ------------------------------------------------------- |
| `BG_PAGE`        | `#0A0F1A` | Page canvas — the darkest layer                         |
| `BG_SUBTLE`      | `#0D1526` | Subtle section differentiation                          |
| `BG_PANEL`       | `#111B2F` | Cards, panels                                           |
| `BG_ELEVATED`    | `#16223A` | Elevated cards, modals, hover states                    |
| `BRAND_GOLD`     | `#C5A55A` | Wins, trophies, first place, positive outcomes          |
| `BRAND_SEAM_RED` | `#C41E3A` | Errors, losing states, critical alerts                  |
| `BRAND_NAVY`     | `#1B3A5C` | Primary interactive (buttons, selected states)          |
| `TEXT_PRIMARY`   | `#E8EDF5` | Primary text                                            |
| `TEXT_SECONDARY` | `#8A9BB5` | Labels, secondary copy                                  |
| `BORDER`         | `#1E2D45` | Subtle dividers                                         |
| `FG1`            | `#F8FAFC` | Primary body text on dark surfaces                      |
| `FG1_STRONG`     | `#FFFFFF` | Max-contrast headline text only                         |
| `FG2`            | `#DEE6FF` | Secondary text                                          |
| `FG3`            | `#9CAAC5` | Muted metadata / labels                                 |
| `FG4`            | `#6C80BA` | Quietest / disabled text                                |
| `SUCCESS`        | `#4AAE7C` | System-status only: validation, sync/connection state   |
| `WARNING`        | `#C89452` | System-status only: degraded state, non-critical alerts |
| `INFO`           | `#5B84C4` | System-status only: neutral system messaging            |

### Accent rules (non-negotiable)

- `BRAND_GOLD` — wins, first place, draft picks, positive outcomes **only**. Never decorative.
- `BRAND_SEAM_RED` — errors, losing, alerts **only**.
- `BRAND_NAVY` — buttons, selected states, primary CTAs **only**.
- `SUCCESS` / `WARNING` / `INFO` — system status only (form validation, connection/sync state, neutral messaging), never win/loss outcomes — those stay `BRAND_GOLD` / `BRAND_SEAM_RED`. Bright hex is for icon dots and accent strokes; pair with a soft-fill + border variant for badges/toasts (see the Design System token file).
- **Banned**: cyan, purple, neon glow, gradient text (`background-clip: text` with a gradient).
- **Banned**: `border-left` / `border-right` accent stripes wider than 1px on cards or callouts.
- **Banned**: any light-theme surface, including in token files — no `.theme-light` / `[data-theme='light']` override block. The app is dark-mode only (see Layout Principles).
- **Exempt — official third-party OAuth buttons** (Discord, Google, Apple, etc.): render with the vendor's mandated brand colors and logo marks (e.g. Discord blurple `#5865F2`, Google's standard white button). Do not restyle vendor auth buttons to brand navy/gold — altering a mandated third-party mark hurts trust/recognition and often violates the vendor's own brand guidelines. Scoped to the button itself; surrounding chrome still follows brand rules.

### Token discipline

Declare every color, font stack, and spacing step as a CSS custom property in a single `:root` block at the top of the stylesheet, named after the tokens above (e.g. `--bg-page`, `--brand-gold`), and reference only the variables in the rest of the CSS — no repeated raw hex values. The implementation pipeline extracts tokens mechanically from the export; scattered magic numbers get lost or mistranscribed.

---

## Typography

| Role                    | Font                  | Weight  | Notes                                |
| ----------------------- | --------------------- | ------- | ------------------------------------ |
| Page / section title    | Big Shoulders Display | 700–800 | Condensed, scoreboard energy         |
| Card heading            | Big Shoulders Display | 600     |                                      |
| Body copy, descriptions | Literata              | 400     | Editorial warmth; max width 70ch     |
| Stat values             | Literata or mono      | 700     | `font-variant-numeric: tabular-nums` |
| Stat labels             | Literata              | 400     | Subdued, `TEXT_SECONDARY`            |

- Load both fonts from Google Fonts CDN in the mockup `<head>`.
- **Never use**: Inter, Playfair Display, Syne, or any other font.
- Type scale: fixed `rem` steps for app/dashboard UI; fluid `clamp()` only for marketing/landing pages.
- Stat columns must align on the decimal — apply `font-variant-numeric: tabular-nums` to every numeric cell.

---

## Layout Principles

- **Progressive disclosure** — surface what matters now; secondary navigation requires deliberate action.
- **Editorial hierarchy** — a standings table and a player card are different information; treat them differently. Not everything is the same card template.
- **No generic card grids** — avoid uniform image-card layouts. Every section should have a clear editorial reason for its visual treatment.
- **Data is the product** — statistics tables should feel as designed as headlines: crisp, legible, with visual weight.
- **Dark mode only** — `BG_PAGE` is the starting layer. Never use white or light backgrounds in app screens.

---

## Conditional States

Every page reference doc lists the conditions that change the rendered output. The mockup must include a visible state switcher (a set of `<button>` tabs at the top of the file) so a reviewer can toggle between:

- **Loading** — skeleton screen that mirrors the actual layout geometry with animated shimmer
- **Error** — error card with icon, message, and retry affordance
- **Empty** — zero-data state with a contextual illustration or message
- **Populated** — the primary success state with representative data
- **Any page-specific states the reference doc defines** — e.g. premium-locked (upgrade prompt), commissioner/owner-only affordances, pre-draft vs. in-season, live vs. final. If the reference doc lists a condition, the mockup shows it.

Skeletons must match the **actual layout shape** — not generic gray bars.

---

## Interactive & Semantic Fidelity

The implementation agent infers component structure and behavior from your markup and CSS, so both must carry the design:

- **Semantic HTML** — real `<button>`, `<nav>`, `<table>`/`<th>`/`<td>` for stats, `<h1>`–`<h3>` hierarchy, `<label>`ed inputs. Never a `<div>` styled to look like a control.
- **Explicit interactive states in CSS** — every interactive element gets `:hover`, `:focus-visible`, and (where applicable) `[disabled]`, selected, and active styling written out. Undocumented states are the single most common handoff gap; the implementer will otherwise guess.
- **Contrast** — body text meets WCAG AA (≥ 4.5:1) against its background; `TEXT_SECONDARY` on `BG_PANEL` is the floor, don't go dimmer for content that must be read.
- **Focus rings** — visible on dark backgrounds (a 2px `TEXT_PRIMARY` outline works; gold is reserved for outcomes, so don't use it here; never remove outlines without a replacement).
- **Scroll & sticky behavior** — annotate regions that scroll independently, sticky headers/columns in stats tables, and overflow behavior at narrow widths.

---

## Representative Data

Fictional but plausible — the mockup should read like a real league:

- Invented team and league names, and user personas — never implying affiliation with a real league, organization, or person.
- **Exception — player-data surfaces**: this is a historical-baseball product whose actual domain data is real players. Pages whose product surface literally displays that data (players list/detail, stats tables, scoreboards, matchups) may use real historical MLB players (e.g. Babe Ruth, Mike Trout) as representative data — that data IS the product. Keep invented names for anything adjacent that isn't player/stat data itself (team names, league names, commissioner personas, social/chat content).
- Sport-correct stat ranges (a batting average of `.287`, not `47.2`; an ERA of `3.64`, not `0.2`) and the decimal precision the reference doc specifies.
- Enough rows/entries to expose the layout's behavior: at least one long team name that tests truncation, a tied score, a negative trend — the edge cases the design must survive.
- If the page serves both baseball and football, show one sport as primary and annotate what changes for the other (columns, positions, terminology) — don't design baseball-only by default.

---

## Motion Annotations

Do not implement animations in the mockup. Instead, annotate with HTML comments describing the intended motion:

```html
<!-- MOTION: slide in from right, 300ms ease-out-quart, on route enter -->
<!-- MOTION: crossfade, 140ms, on tab switch -->
<!-- MOTION: skeleton shimmer, 1.4s linear infinite -->
```

Timing and motion conventions (for annotation only):

- **Route transitions must have directional meaning**: drill-down slides in from right; back slides out to left; tab switches crossfade (parallel, not hierarchical)
- Route transitions: 280–320ms ease-out-quart
- Micro-interactions: 120–150ms
- Animate only transform and opacity — never width, height, padding, or margin
- Honor `prefers-reduced-motion`: crossfades only, no positional movement

---

## Breakpoints

Mockups use seven breakpoint bands (min-width thresholds, from `lib/design-tokens/src/lib/breakpoints.ts` — that file is canonical for this table):

| Band  | Starts at | Typical device               |
| ----- | --------- | ---------------------------- |
| `xxs` | 0px       | Phones (design at 375px)     |
| `xs`  | 660px     | Large phones / small tablets |
| `sm`  | 800px     | Tablets portrait             |
| `md`  | 860px     | Tablets landscape            |
| `lg`  | 980px     | Small laptops                |
| `xl`  | 1120px    | Laptops                      |
| `xxl` | 1280px    | Desktops (design at 1280px)  |

> **These are mockup bands, not the implementation's media tokens.** Despite the "mirrors Tamagui" claim that used to sit above this table, `md`/`lg`/`xl` do not match: Tamagui's `$md` fires at ≤1020px, not 860, and there is no `$xxl` at all. A reflow you design at 860 will land at 1020 when implemented unless the implementer is told otherwise. So **annotate reflows with the pixel width, not just the band name** — "collapses below 860px" survives the handoff; "collapses at `md`" does not. Full mapping: [`.agents/skills/ui/references/responsive-density.md`](../../../.agents/skills/ui/references/responsive-density.md#known-drift).

The mockup must account for **all seven bands**, not just phone and desktop:

- Design a distinct layout for every band where the page's layout actually changes, and make each one viewable in the file (toggle or side-by-side). Reflow only at these thresholds — never invent breakpoints like 768px.
- Bands that share a layout don't need separate frames — annotate the coverage instead (e.g. `<!-- BREAKPOINTS: this layout serves xs–md (660–979px); columns drop from 4 to 2 at lg -->`). Every band must be claimed by exactly one designed layout; none may be left to chance.
- At minimum, `xxs` (375px) and `xxl` (1280px) always get fully designed frames; the reference doc may require more or override the defaults.

**A breakpoint toggle is not a deliverable — the designed layout behind it is.** Every state × breakpoint combination must render a finished layout: switching to any breakpoint in any state must never show a blank frame, an unstyled dump, or another band's layout squeezed. Before marking the design complete, click through the full state × breakpoint matrix and verify each cell.

- Annotate **how the layout reflows** between bands (e.g. "stats table collapses to stacked cards below `sm` (800px)", "sidebar moves below content at `lg`"), not just static frames.
- Touch targets: annotate any interactive element that must be ≥ 44×44px with a comment.

---

## Handoff Notes

Close the loop for the implementation agent, which reads the chat transcript and the HTML source:

- Put a `<!-- HANDOFF -->` comment block at the top of the HTML file summarizing: which file is final, the key design decisions and why, any deliberate deviations from the page reference doc, and open questions for the implementer.
- End the design conversation with a short summary of where you landed — the transcript is the durable record of intent, and the implementer is instructed to read it first.
- Annotate repeated visual patterns as intended reusable components (e.g. `<!-- COMPONENT: stat-row — reused in standings + matchup -->`) so the implementer can map them to the shared component library.

---

## Deliverable Checklist

Before marking the design complete, verify:

- [ ] Read the design system, the brand guidelines (`docs/design/brand.md` or the mirrored sections above), and the page reference doc before starting
- [ ] Output is a single self-contained HTML file (Claude Design project file, or `scratch/mockups/<page-name>.html` locally)
- [ ] All four core states are present and togglable (loading, error, empty, populated), plus every page-specific state the reference doc defines
- [ ] No framework or library `<script src>` from any CDN (React, Babel, Vue, etc.) — vanilla JS only; the only allowed external CDN is Google Fonts
- [ ] Fonts loaded from Google Fonts CDN (Big Shoulders Display + Literata)
- [ ] All colors/fonts/spacing declared as CSS custom properties in one `:root` block; no repeated raw hex values
- [ ] No hardcoded colors outside the palette table above
- [ ] No cyan, purple, or neon accents; no gradient text (official third-party OAuth button branding is exempt)
- [ ] No light-theme surfaces or `.theme-light`/`[data-theme='light']` token blocks — dark mode only
- [ ] No `border-left`/`border-right` accent stripes wider than 1px
- [ ] Semantic HTML for every control, heading, and table
- [ ] `:hover`, `:focus-visible`, and `[disabled]`/selected states written out in CSS for every interactive element
- [ ] Body text meets WCAG AA contrast; focus rings visible on dark backgrounds
- [ ] Stats columns use `tabular-nums`
- [ ] Body copy does not exceed 70ch width
- [ ] Skeleton screens match the actual layout geometry
- [ ] Motion intent annotated via HTML comments
- [ ] All seven breakpoint bands (`xxs`–`xxl`) are covered — each band is either a designed frame or explicitly annotated as sharing one; `xxs` (375px) and `xxl` (1280px) are always fully designed
- [ ] The complete state × breakpoint matrix was clicked through — no combination shows a blank, unstyled, or squeezed frame
- [ ] Reflow behavior annotated at the canonical thresholds (660/800/860/980/1120/1280) — no invented breakpoints
- [ ] Representative data with sport-correct stat ranges and edge cases — no "Lorem ipsum"; real historical MLB players are allowed on player-data surfaces (players/stats/detail/scoreboard) but invented team/league names and personas elsewhere
- [ ] `<!-- HANDOFF -->` block at the top of the file; reusable patterns annotated as components
- [ ] Design intent comments explain _why_ choices were made, not _what_ they are
