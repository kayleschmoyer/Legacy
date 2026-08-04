# Sync report: Homepage

**Design ID**: `nxFiEGqu3yPCDKpoNDmQWA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `714ce35a-d395-4e13-aadd-8d5d9f021104`)
**Synced at**: 2026-08-04T00:15:00.000Z
**Bundle hash**: `23f32c9b49f0f536dfbcc0173bdac54b610dbe4d0c76680dfb2802ce723b67a0`
**Files**: 18
**Total size**: see individual file listing below

## Follow-up: restored three fixes the initial DesignSync source lacked

The Reviewer Bot caught a regression in the first pass of this sync: the Claude Design project's `home.html` was missing three accessibility fixes that existed only in the previously-committed `docs/design/` bundle on `main` (never pushed back to the design source) — `data-modal-close` on the tutorial modal's "Skip" button, `alt="Draft"` on the mock-draft icon, and an A11Y NOTE comment (LS-4930) on the league-hero card. Fetching from DesignSync and overwriting the bundle silently reverted these. Fixed by writing all three back into the Claude Design project (so the source and the bundle agree) and re-pulling — never patched in `docs/design/` alone.

## What changed (LS-8973 — re-run to meet updated PROMPT.md brief)

Only `project/scratch/mockups/home.html` changed. Fixed at the source in Claude Design (via `DesignSync` write) per the LS-8954 audit findings, then re-pulled here:

- **Removed the third typeface** (JetBrains Mono) — Google Fonts import and the `--font-mono` token are gone; `.otd-stat`, `.error-inline-code`, and `.mono-num` now use `var(--font-body)` with `font-variant-numeric: tabular-nums`, matching the design system's "no mono face" rule.
- **Fixed the off-token page background** — `body`/`.review-bar` background changed from raw `#05080F` to `var(--bg-page)` (`#0A0F1A`).
- **Tokenized repeated raw hex** — added `--text-headline: #FFFFFF` and replaced all 10 raw `#fff` uses; replaced all 5 raw `#445676` uses with `var(--text-muted)`; replaced the one raw `#E63950` (chip-live) with the existing `var(--brand-seam-red-lt)`.
- **Fixed the invented 768px breakpoint** — the "Tablet" frame now uses 800px (the `sm` band start per `lib/design-tokens/src/lib/breakpoints.ts`), and the `dashboard-split` collapse threshold moved from the invented `max-width: 1024px` to the canonical `max-width: 979px` (below `lg`). Added a `BREAKPOINTS` coverage comment claiming all seven bands (xxs/xs/sm/md/lg/xl/xxl) per the PROMPT.md checklist.
- **Added `:focus-visible` states** — all 12 elements that had `:hover` now have a paired `:focus-visible` rule with a visible `var(--text-primary)` outline, per the Interactive & Semantic Fidelity section.
- **Added a `<!-- HANDOFF -->` block and `<!-- COMPONENT -->` annotations** (league-hero, matchup, league-row, rail-card/otd-item, sport-card) — previously missing.
- **Left "Draft Ruth alongside Trout" unchanged** — LS-9004 resolved the real-historical-players ruling; this copy describes the actual drafting mechanic (the product's real domain data), which the ruling covers. Documented in the new HANDOFF block.

**Off-palette findings from the LS-8954 audit that turned out to be non-issues**: `--success #4AAE7C`, `--warning #C89452`, `--text-muted #6C80BA`, `--pos-outfield #2D6A4F` all already match the canonical Design System tokens (`docs/design/7SRWFMj3a6khIhwLuWkSKA/legacy-sports-design-system/project/colors_and_type.css`) and brand.md's Ruling 3 (LS-9004) — no change needed.

## Pages

- `legacy-sports-homepage/project/scratch/mockups/home.html`

## All files

```
legacy-sports-homepage/README.md
legacy-sports-homepage/chats/chat1.md
legacy-sports-homepage/project/assets/logo.png
legacy-sports-homepage/project/icons/brand/award.svg
legacy-sports-homepage/project/icons/brand/baseball.svg
legacy-sports-homepage/project/icons/brand/bell.svg
legacy-sports-homepage/project/icons/brand/draft.svg
legacy-sports-homepage/project/icons/brand/football.svg
legacy-sports-homepage/project/icons/brand/league.svg
legacy-sports-homepage/project/icons/brand/live.svg
legacy-sports-homepage/project/icons/brand/matchup.svg
legacy-sports-homepage/project/icons/brand/scoreboard.svg
legacy-sports-homepage/project/icons/brand/standings.svg
legacy-sports-homepage/project/icons/brand/stats.svg
legacy-sports-homepage/project/icons/brand/trophy.svg
legacy-sports-homepage/project/scratch/mockups/home.html
legacy-sports-homepage/project/uploads/PROMPT.md
legacy-sports-homepage/project/uploads/home.md
```
