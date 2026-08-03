# Page Design Prompt — Legacy Sports Web App

> Load this file before designing any page in `apps/web/src/pages/`. It defines the design brief, visual standards, and deliverable format for mockup sessions. **No functional code is written here** — the output is a design artifact for a future implementation agent.

> **Maintenance note**: the Brand & Visual Identity, Color, Typography, Layout, and Motion sections below mirror [`docs/design/brand.md`](../../design/brand.md) (canonical). This file is uploaded standalone into Claude Design projects, where repo paths don't resolve, so it must stay self-contained — when brand rules change, update `brand.md` first, then re-mirror here. On any conflict, `brand.md` wins.

---

## Mandatory Pre-Read

Before designing anything, read:

1. **The design system** at https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb — the canonical source of truth for tokens, colors, typography, and component patterns. Fetch it via WebFetch from cloud sessions; it is only reachable from claude.ai-authenticated environments.
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

| Token            | Hex       | Use                                            |
| ---------------- | --------- | ---------------------------------------------- |
| `BG_PAGE`        | `#0A0F1A` | Page canvas — the darkest layer                |
| `BG_SUBTLE`      | `#0D1526` | Subtle section differentiation                 |
| `BG_PANEL`       | `#111B2F` | Cards, panels                                  |
| `BG_ELEVATED`    | `#16223A` | Elevated cards, modals, hover states           |
| `BRAND_GOLD`     | `#C5A55A` | Wins, trophies, first place, positive outcomes |
| `BRAND_SEAM_RED` | `#C41E3A` | Errors, losing states, critical alerts         |
| `BRAND_NAVY`     | `#1B3A5C` | Primary interactive (buttons, selected states) |
| `TEXT_PRIMARY`   | `#E8EDF5` | Primary text                                   |
| `TEXT_SECONDARY` | `#8A9BB5` | Labels, secondary copy                         |
| `BORDER`         | `#1E2D45` | Subtle dividers                                |

### Accent rules (non-negotiable)

- `BRAND_GOLD` — wins, first place, draft picks, positive outcomes **only**. Never decorative.
- `BRAND_SEAM_RED` — errors, losing, alerts **only**.
- `BRAND_NAVY` — buttons, selected states, primary CTAs **only**.
- **Banned**: cyan, purple, neon glow, gradient text (`background-clip: text` with a gradient).
- **Banned**: `border-left` / `border-right` accent stripes wider than 1px on cards or callouts.

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

- Invented team and player names; never real MLB/NFL players or trademarks.
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

## Mobile & Desktop Layouts

The reference doc specifies the route and primary breakpoints. The mockup should show **both** in a single file — a side-by-side or toggle layout. Default to showing the mobile view (375px) as primary; include a desktop preview (1280px) as a secondary panel or via a toggle button.

- Annotate **how the layout reflows** between the two (e.g. "stats table collapses to stacked cards below 768px", "sidebar moves below content"), not just two static frames.
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
- [ ] Fonts loaded from Google Fonts CDN (Big Shoulders Display + Literata)
- [ ] All colors/fonts/spacing declared as CSS custom properties in one `:root` block; no repeated raw hex values
- [ ] No hardcoded colors outside the palette table above
- [ ] No cyan, purple, or neon accents; no gradient text
- [ ] No `border-left`/`border-right` accent stripes wider than 1px
- [ ] Semantic HTML for every control, heading, and table
- [ ] `:hover`, `:focus-visible`, and `[disabled]`/selected states written out in CSS for every interactive element
- [ ] Body text meets WCAG AA contrast; focus rings visible on dark backgrounds
- [ ] Stats columns use `tabular-nums`
- [ ] Body copy does not exceed 70ch width
- [ ] Skeleton screens match the actual layout geometry
- [ ] Motion intent annotated via HTML comments
- [ ] Mobile (375px) and desktop (1280px) layouts both shown, with reflow behavior annotated
- [ ] Representative fictional data with sport-correct stat ranges and edge cases — no "Lorem ipsum", no real players
- [ ] `<!-- HANDOFF -->` block at the top of the file; reusable patterns annotated as components
- [ ] Design intent comments explain _why_ choices were made, not _what_ they are
