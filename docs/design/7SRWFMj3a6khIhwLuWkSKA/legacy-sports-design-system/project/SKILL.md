---
name: legacy-sports-design
description: Use this skill to generate well-branded interfaces and assets for Legacy Sports — a year-round fantasy baseball app that brings real MLB history to fantasy play. Contains essential design guidelines, colors, type, fonts, logos, and UI kit components for prototyping marketing pages, product screens, decks, and throwaway mocks.
user-invocable: true
---

Read the `README.md` file within this skill — it defines the brand voice, content patterns, visual foundations, iconography, and points at every other file.

Core files to know:

- `colors_and_type.css` — drop this into any HTML artifact and you get all CSS variables + semantic type recipes (h1–h4, .eyebrow, .score, .team-abbr, .caption, .mono) on-brand.
- `assets/` — real logos (primary shield mark + favicon variants). Copy these into your output; do not redraw them.
- `icons/brand/` — custom sport-themed SVG glyphs in the BrandIcon style. Baseball, football, trophy, draft shield, live pulse, etc.
- `icons/README.md` — how to reference Lucide for generic UI glyphs via CDN.
- `preview/` — color, type, radii, shadow, and component cards. Good reference for tokens in context.
- `ui_kits/web/` — high-fidelity React recreations of the web app (landing, dashboard, scoreboard, league detail). Lift components from here; do not reinvent them.

When creating visual artifacts (slides, mocks, throwaway prototypes):

1. Copy `colors_and_type.css` and the needed assets into the artifact's folder.
2. Link `colors_and_type.css` and use the CSS variables / semantic classes directly.
3. Default to the **dark theme** (the product is dark-theme-primary). Only ship light-theme work if explicitly asked.
4. Use the UI kit components as structural references — don't reinvent the LeagueCard, GameCard, or nav.
5. **No emoji.** Use BrandIcon SVGs from `icons/brand/` or Lucide. See `icons/README.md`.
6. Use the "night stadium" radial-gradient background on any marketing surface (see `--grad-hero`).

When working on production code:

- The real app lives in `web/` (React + Vite + Tamagui). Tokens are defined in `tamagui-config/src/lib/tamagui-config.ts`. Do not duplicate tokens — reference them.
- The full BrandIcon library (~80 glyphs) is at `shared-components/src/components/icons/BrandIcon.tsx`.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask what product surface (marketing, dashboard, scoreboard, league, draft), ask whether they want dark or light (default: dark), and whether they want variations. Then act as an expert designer who outputs HTML artifacts or production code depending on the need.
