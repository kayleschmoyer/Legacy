# Page Design Prompt — Legacy Sports Web App

> Load this file before designing any page in `apps/web/src/pages/`. It defines the design brief, visual standards, and deliverable format for mockup sessions. **No functional code is written here** — the output is a design artifact for a future implementation agent.

---

## Mandatory Pre-Read

Before designing anything, read:

1. **`/.impeccable.md`** — the full design brief. Every visual decision must be traceable back to a principle there.
2. **The page's reference doc** in this directory (e.g., `home.md`, `scoreboard.md`). It defines the exact data model, conditional states, and route — use it to know what content must appear and under what conditions.

---

## What This Session Produces

The output is a **static HTML mockup** — a single self-contained `.html` file written to `scratch/mockups/<page-name>.html`. It must:

- Render correctly when opened directly in a browser (no build step, no server)
- Use only inline `<style>` blocks and `<script>` (no external dependencies except Google Fonts via CDN)
- Contain representative but clearly fictional data (names, scores, stats)
- Cover every conditional state the page reference doc defines (loading skeleton, error, empty, populated)
- Be annotated with design intent comments — not implementation notes

This file is a communication tool for handoff, not a code scaffold.

---

## Brand & Visual Identity

### Personality

**Nostalgic, sporty, professional.** The voice of a seasoned beat reporter who still gets excited every Opening Day. Not flashy, not corporate, not casual.

**Never reference**: Yahoo Sports (blocky, no craft, committee-designed grids). Every screen needs an editorial point of view.

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

Skeletons must match the **actual layout shape** — not generic gray bars.

---

## Motion Annotations

Do not implement animations in the mockup. Instead, annotate with HTML comments describing the intended motion:

```html
<!-- MOTION: slide in from right, 300ms ease-out-quart, on route enter -->
<!-- MOTION: crossfade, 140ms, on tab switch -->
<!-- MOTION: skeleton shimmer, 1.4s linear infinite -->
```

Timing conventions (for annotation only):

- Route transitions: 280–320ms ease-out-quart
- Micro-interactions: 120–150ms
- Honor `prefers-reduced-motion`: crossfades only, no positional movement

---

## Mobile & Desktop Layouts

The reference doc specifies the route and primary breakpoints. The mockup should show **both** in a single file — a side-by-side or toggle layout. Default to showing the mobile view (375px) as primary; include a desktop preview (1280px) as a secondary panel or via a toggle button.

Touch targets: annotate any interactive element that must be ≥ 44×44px with a comment.

---

## Deliverable Checklist

Before marking the design complete, verify:

- [ ] Reads `/.impeccable.md` and the page reference doc before starting
- [ ] Output is a single self-contained HTML file in `scratch/mockups/<page-name>.html`
- [ ] All four states are present and togglable (loading, error, empty, populated)
- [ ] Fonts loaded from Google Fonts CDN (Big Shoulders Display + Literata)
- [ ] No hardcoded colors outside the palette table above
- [ ] No cyan, purple, or neon accents
- [ ] No gradient text
- [ ] No `border-left`/`border-right` accent stripes wider than 1px
- [ ] Stats columns use `tabular-nums`
- [ ] Body copy does not exceed 70ch width
- [ ] Skeleton screens match the actual layout geometry
- [ ] Motion intent annotated via HTML comments
- [ ] Mobile (375px) and desktop (1280px) layouts both shown
- [ ] Representative fictional data used throughout — no "Lorem ipsum"
- [ ] Design intent comments explain _why_ choices were made, not _what_ they are
