# Sync report: Design System

**Design ID**: `7SRWFMj3a6khIhwLuWkSKA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `670f7892-5193-4b8a-a54c-20b112ad11bb`)
**Synced at**: 2026-08-03T22:28:20.000Z
**Sync ticket**: LS-9007
**Bundle hash**: `2ce1fb951a1c16da6b5eb9d7cbc132c8eb85e678ce9fdf7b917c669b40ae2ec8`
**Files**: 118
**Total size**: 2375117 bytes

## What changed (vs 2026-05-20 sync, hash `5af5d7f8…`)

Targeted pull after agent-driven source fixes for **LS-8957** (PROMPT.md brief
violations, audited in LS-8954) were pushed to the Claude Design project via
`finalize_plan` → `write_files`. Four files changed; all other bundle files are
untouched:

- `legacy-sports-design-system/project/colors_and_type.css` — removed the
  JetBrains Mono `@import` and `--font-mono` (two-typeface rule; stat/tabular
  styling now Literata + `tabular-nums`); deleted the
  `.theme-light, [data-theme='light']` override block (dark-mode-only rule);
  header now documents the brand.md `TEXT_PRIMARY`/`TEXT_SECONDARY`/`BORDER` →
  extended-ramp token mapping (values intentionally unchanged — residual
  conflict flagged on LS-8957 for the brief owner).
- `legacy-sports-design-system/project/preview/components-player-card.html` —
  position accent `border-left` 4px → 1px (banned >1px side-stripe); era
  metadata line mono → Literata + `tabular-nums`.
- `legacy-sports-design-system/project/preview/components-chips.html` —
  Tailwind `#22c55e`/`#f59e0b` chip colors → `--success-*`/`--warning-*` tokens.
- `legacy-sports-design-system/project/ui_kits/web/styles.css` —
  `.ls-player-row` stripe 4px → 1px; `.ls-chip-active`/`.ls-chip-soon` hexes →
  semantic tokens; `.ls-mono` → Literata + `tabular-nums`; the invented
  `@media (max-width: 900px)` breakpoint split into canonical band edges
  (`max-width: 979px` = below `$lg`, `max-width: 799px` = below `$sm`), matching
  `preview/breakpoints.html` and `lib/design-tokens/src/lib/breakpoints.ts`.

### Notes / gaps

- **Partial pull by design**: only the four files changed at the source were
  pulled. The remote project also contains files that have never been part of
  this bundle (`CLAUDE.md`, `_ds_manifest.json`, `_ds_bundle.js`,
  `_adherence.oxlintrc.json`, `.thumbnail`, `templates/breakpoint-harness/**`)
  — added in the Claude Design app after the 2026-05-20 cloud sync. Left for
  the next bulk `/sync-designs` (or LS-9005 reconciliation sweep) to true up.
- **Hash discrepancy (pre-existing)**: the stored 2026-05-20 hash could not be
  reproduced with the documented algorithm (manifest-schema.md §Hashing:
  all files under `docs/design/<id>/` excluding `SYNC-REPORT.md`, sorted,
  `<relpath>\t<sha256>\n`, sha256 of the joined string — computed
  `967df6a6…` for the pre-change tree vs stored `5af5d7f8…`). The new hash
  above IS computed per the documented algorithm; expect the next cloud sync to
  report this design as changed regardless.
- No truncated reads (every `get_file` returned `truncated: false`); no binary
  fetches were needed.

## Pages

- `legacy-sports-design-system/project/preview/brand-hero.html`
- `legacy-sports-design-system/project/preview/brand-icons.html`
- `legacy-sports-design-system/project/preview/brand-logo.html`
- `legacy-sports-design-system/project/preview/breakpoints.html`
- `legacy-sports-design-system/project/preview/colors-brand.html`
- `legacy-sports-design-system/project/preview/colors-positions.html`
- `legacy-sports-design-system/project/preview/colors-semantic.html`
- `legacy-sports-design-system/project/preview/colors-surface-dark.html`
- `legacy-sports-design-system/project/preview/components-avatar-banner-picker.html`
- `legacy-sports-design-system/project/preview/components-avatar.html`
- `legacy-sports-design-system/project/preview/components-buttons.html`
- `legacy-sports-design-system/project/preview/components-card.html`
- `legacy-sports-design-system/project/preview/components-chips.html`
- `legacy-sports-design-system/project/preview/components-date-time-picker.html`
- `legacy-sports-design-system/project/preview/components-dialog.html`
- `legacy-sports-design-system/project/preview/components-empty-state.html`
- `legacy-sports-design-system/project/preview/components-form.html`
- `legacy-sports-design-system/project/preview/components-holographic-card.html`
- `legacy-sports-design-system/project/preview/components-icon-button.html`
- `legacy-sports-design-system/project/preview/components-input.html`
- `legacy-sports-design-system/project/preview/components-league-card.html`
- `legacy-sports-design-system/project/preview/components-matchup-card.html`
- `legacy-sports-design-system/project/preview/components-nav.html`
- `legacy-sports-design-system/project/preview/components-notification.html`
- `legacy-sports-design-system/project/preview/components-player-card.html`
- `legacy-sports-design-system/project/preview/components-popover.html`
- `legacy-sports-design-system/project/preview/components-search-bar.html`
- `legacy-sports-design-system/project/preview/components-select.html`
- `legacy-sports-design-system/project/preview/components-separator.html`
- `legacy-sports-design-system/project/preview/components-sheet.html`
- `legacy-sports-design-system/project/preview/components-spinner.html`
- `legacy-sports-design-system/project/preview/components-stack.html`
- `legacy-sports-design-system/project/preview/components-standings.html`
- `legacy-sports-design-system/project/preview/components-status-badge.html`
- `legacy-sports-design-system/project/preview/components-table.html`
- `legacy-sports-design-system/project/preview/components-tabs.html`
- `legacy-sports-design-system/project/preview/components-toggle.html`
- `legacy-sports-design-system/project/preview/components-typography.html`
- `legacy-sports-design-system/project/preview/radii.html`
- `legacy-sports-design-system/project/preview/shadows.html`
- `legacy-sports-design-system/project/preview/spacing-scale.html`
- `legacy-sports-design-system/project/preview/type-body.html`
- `legacy-sports-design-system/project/preview/type-display.html`
- `legacy-sports-design-system/project/preview/type-score.html`
- `legacy-sports-design-system/project/ui_kits/web/index.html`

## All files

```
legacy-sports-design-system/README.md
legacy-sports-design-system/chats/chat1.md
legacy-sports-design-system/chats/chat2.md
legacy-sports-design-system/chats/chat3.md
legacy-sports-design-system/project/README.md
legacy-sports-design-system/project/SKILL.md
legacy-sports-design-system/project/STORYBOOK_PLAN.md
legacy-sports-design-system/project/assets/apple-touch-icon.png
legacy-sports-design-system/project/assets/favicon.ico
legacy-sports-design-system/project/assets/logo-192.png
legacy-sports-design-system/project/assets/logo-512.png
legacy-sports-design-system/project/assets/logo.png
legacy-sports-design-system/project/colors_and_type.css
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-design-system/project/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-greek.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-latin.woff2
legacy-sports-design-system/project/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-greek.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-latin.woff2
legacy-sports-design-system/project/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-greek.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-latin.woff2
legacy-sports-design-system/project/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-design-system/project/icons/README.md
legacy-sports-design-system/project/icons/brand/award.svg
legacy-sports-design-system/project/icons/brand/baseball.svg
legacy-sports-design-system/project/icons/brand/bell.svg
legacy-sports-design-system/project/icons/brand/commissioner.svg
legacy-sports-design-system/project/icons/brand/draft.svg
legacy-sports-design-system/project/icons/brand/football.svg
legacy-sports-design-system/project/icons/brand/league.svg
legacy-sports-design-system/project/icons/brand/live.svg
legacy-sports-design-system/project/icons/brand/matchup.svg
legacy-sports-design-system/project/icons/brand/roster.svg
legacy-sports-design-system/project/icons/brand/scoreboard.svg
legacy-sports-design-system/project/icons/brand/secure.svg
legacy-sports-design-system/project/icons/brand/standings.svg
legacy-sports-design-system/project/icons/brand/stats.svg
legacy-sports-design-system/project/icons/brand/trophy.svg
legacy-sports-design-system/project/icons/brand/zap.svg
legacy-sports-design-system/project/preview/brand-hero.html
legacy-sports-design-system/project/preview/brand-icons.html
legacy-sports-design-system/project/preview/brand-logo.html
legacy-sports-design-system/project/preview/breakpoints.html
legacy-sports-design-system/project/preview/colors-brand.html
legacy-sports-design-system/project/preview/colors-positions.html
legacy-sports-design-system/project/preview/colors-semantic.html
legacy-sports-design-system/project/preview/colors-surface-dark.html
legacy-sports-design-system/project/preview/components-avatar-banner-picker.html
legacy-sports-design-system/project/preview/components-avatar.html
legacy-sports-design-system/project/preview/components-buttons.html
legacy-sports-design-system/project/preview/components-card.html
legacy-sports-design-system/project/preview/components-chips.html
legacy-sports-design-system/project/preview/components-date-time-picker.html
legacy-sports-design-system/project/preview/components-dialog.html
legacy-sports-design-system/project/preview/components-empty-state.html
legacy-sports-design-system/project/preview/components-form.html
legacy-sports-design-system/project/preview/components-holographic-card.html
legacy-sports-design-system/project/preview/components-icon-button.html
legacy-sports-design-system/project/preview/components-input.html
legacy-sports-design-system/project/preview/components-league-card.html
legacy-sports-design-system/project/preview/components-matchup-card.html
legacy-sports-design-system/project/preview/components-nav.html
legacy-sports-design-system/project/preview/components-notification.html
legacy-sports-design-system/project/preview/components-player-card.html
legacy-sports-design-system/project/preview/components-popover.html
legacy-sports-design-system/project/preview/components-search-bar.html
legacy-sports-design-system/project/preview/components-select.html
legacy-sports-design-system/project/preview/components-separator.html
legacy-sports-design-system/project/preview/components-sheet.html
legacy-sports-design-system/project/preview/components-spinner.html
legacy-sports-design-system/project/preview/components-stack.html
legacy-sports-design-system/project/preview/components-standings.html
legacy-sports-design-system/project/preview/components-status-badge.html
legacy-sports-design-system/project/preview/components-table.html
legacy-sports-design-system/project/preview/components-tabs.html
legacy-sports-design-system/project/preview/components-toggle.html
legacy-sports-design-system/project/preview/components-typography.html
legacy-sports-design-system/project/preview/radii.html
legacy-sports-design-system/project/preview/shadows.html
legacy-sports-design-system/project/preview/spacing-scale.html
legacy-sports-design-system/project/preview/type-body.html
legacy-sports-design-system/project/preview/type-display.html
legacy-sports-design-system/project/preview/type-score.html
legacy-sports-design-system/project/scraps/sep-check.png
legacy-sports-design-system/project/scraps/sep-check2.png
legacy-sports-design-system/project/scraps/sep-check3.png
legacy-sports-design-system/project/scraps/sep-check4.png
legacy-sports-design-system/project/ui_kits/web/Dashboard.jsx
legacy-sports-design-system/project/ui_kits/web/Draft.jsx
legacy-sports-design-system/project/ui_kits/web/Landing.jsx
legacy-sports-design-system/project/ui_kits/web/League.jsx
legacy-sports-design-system/project/ui_kits/web/Nav.jsx
legacy-sports-design-system/project/ui_kits/web/README.md
legacy-sports-design-system/project/ui_kits/web/Scoreboard.jsx
legacy-sports-design-system/project/ui_kits/web/index.html
legacy-sports-design-system/project/ui_kits/web/styles.css
legacy-sports-design-system/project/uploads/logo.png
```
