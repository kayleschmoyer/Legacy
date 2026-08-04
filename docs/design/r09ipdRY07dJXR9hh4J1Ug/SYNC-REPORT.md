# Sync report: Admin

**Design ID**: `r09ipdRY07dJXR9hh4J1Ug`
**Source**: `designsync-local` (projectId `019de99c-d234-7101-925b-8ca34e3b0103`)
**Synced at**: 2026-08-04T15:49:28.000Z
**Bundle hash**: `sha256-72095bd10902bb24684be54f9567af7489ef6fd9179eb1ecd7be09c414ada29e`
**Files**: 56
**Sync ticket**: LS-8976

## What changed vs. the previous sync (2026-05-20, hash `9a61976a...`)

Fixed at the source via the DesignSync MCP tool (`finalize_plan` → `write_files`, round-trip verified via `get_file`), per the LS-8954 audit findings for this bundle:

- **HIGH — extra fonts**: removed the JetBrains Mono `@import` and `--font-mono` token from `design_system/colors_and_type.css`; all ID/JSON/JWT/mono recipes now use `var(--font-body)` (Literata) + `font-variant-numeric: tabular-nums`. Dropped the `'Oswald', system-ui` named fallbacks from `--font-display` (two-typeface rule: `'Big Shoulders Display', sans-serif`). Replaced the phone status bar's `-apple-system, 'SF Pro', system-ui` with `var(--font-display)` in `Admin Console.html`.
- **HIGH — light-theme block**: deleted the `.theme-light` / `[data-theme='light']` override block from `design_system/colors_and_type.css` (dark-mode-only rule, brand.md).
- **MED — raw hex/rgba instead of tokens**: `admin-styles.css` had brand-gold rgba repeated 7× and danger-red rgba repeated 9× as literals instead of variables. Added a local admin-scoped token block (`--admin-glow-*`, `--admin-gold-*`, `--admin-danger-*`, `--admin-focus-glow`, etc.) and replaced every repeated raw `rgba()`/hex literal with a reference to it or to an existing shared token (`--danger-border`, `--success-border`, `--focus-ring`).
- **Keyboard-inoperable accordion headers**: both accordion headers (`Section`, `JwtSection` in `admin-component.jsx`) were clickable `<header onClick>` divs — not focusable, not operable via Enter/Space. Rewrote as the WAI-ARIA APG accordion pattern: `<h2><button type="button" aria-expanded aria-controls>...</button></h2>`, with matching CSS (`.section-head` as a full-width text-left `<button>`, `.section-head .title` replacing the old nested `<h2>`).
- **Missing focus states**: added `:focus-visible` outline treatments (2px `var(--fg1)` on dark surfaces, per PROMPT.md) to every previously-unstyled interactive element: `.btn`, `.review-tabs button`, `.width-toggle button`, `.surface-toggle button`, `.section-head`, `.page-head .quick-link`; converted `.search input:focus` / `.jwt-input:focus` to `:focus-visible`.
- **LOW — real historical MLB players in fixtures** (LS-9004 ruling applied): Admin is a user-management surface, not a player-data surface (players/stats/detail/scoreboard/matchups), so the real-player exception doesn't apply here. Replaced all 12 `USERS` fixture entries (ruth_bambino, cobb_tyrus, gehrig_iron, wagner_honus, aaron_hammer, mays_say_hey, clemente_pride, koufax_southpaw, robinson_jackie, griffey_jr, plus the "me" user and nav avatar) with fictional personas; regenerated the sample JWT payloads to match.

Not changed (out of scope for this pass / deliberately left, matching the LS-8957 master Design System precedent): self-hosted `@font-face` vs. Google Fonts CDN (an open ruling that applies fleet-wide, not per-bundle); the `@media (max-width: 1700px)` reviewer-harness breakpoint and the JS-driven phone-width toggle (mockup harness chrome, not the seven canonical PROMPT.md bands — not part of this ticket's mechanical-violations scope); `ios-frame.jsx` (unused by this project's `Admin Console.html`, still references `'SF Pro'` — shared harness file, not consumed here).

## Pages

- `legacy-sports-admin/project/Admin Console.html`

## All files

```
legacy-sports-admin/README.md
legacy-sports-admin/chats/chat1.md
legacy-sports-admin/project/Admin Console.html
legacy-sports-admin/project/admin-component.jsx
legacy-sports-admin/project/admin-styles.css
legacy-sports-admin/project/design_system/assets/logo.png
legacy-sports-admin/project/design_system/colors_and_type.css
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-admin/project/design_system/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-greek.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-latin.woff2
legacy-sports-admin/project/design_system/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-greek.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-latin.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-greek.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-latin.woff2
legacy-sports-admin/project/design_system/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-admin/project/design_system/icons/brand/award.svg
legacy-sports-admin/project/design_system/icons/brand/baseball.svg
legacy-sports-admin/project/design_system/icons/brand/bell.svg
legacy-sports-admin/project/design_system/icons/brand/commissioner.svg
legacy-sports-admin/project/design_system/icons/brand/draft.svg
legacy-sports-admin/project/design_system/icons/brand/football.svg
legacy-sports-admin/project/design_system/icons/brand/league.svg
legacy-sports-admin/project/design_system/icons/brand/live.svg
legacy-sports-admin/project/design_system/icons/brand/matchup.svg
legacy-sports-admin/project/design_system/icons/brand/roster.svg
legacy-sports-admin/project/design_system/icons/brand/scoreboard.svg
legacy-sports-admin/project/design_system/icons/brand/secure.svg
legacy-sports-admin/project/design_system/icons/brand/standings.svg
legacy-sports-admin/project/design_system/icons/brand/stats.svg
legacy-sports-admin/project/design_system/icons/brand/trophy.svg
legacy-sports-admin/project/design_system/icons/brand/zap.svg
legacy-sports-admin/project/ios-frame.jsx
legacy-sports-admin/project/uploads/PROMPT.md
legacy-sports-admin/project/uploads/index.md
```
