# Sync report: Nav Bar

**Design ID**: `dNpCFgIxoT5OnLy71wHjrg`
**Source**: DesignSync tool (local), projectId `20f12546-37e6-4441-b8b2-a3cb113c5004`
**Synced at**: 2026-08-04T19:30:00.000Z
**Bundle hash**: `03e6532014da7cca0f493ca6b9d72fae44755c3891887971f5c3b86f57ad97a1`
**Files**: 27
**Total size**: n/a (delta sync, not a full-bundle byte count)
**Ticket**: LS-8968 (re-run of Nav Bar to meet updated PROMPT.md brief; audit LS-8954, epic LS-4568)

## What changed vs. previous hash (`4e6fdf1e...`)

Fixed the mechanical violations from the LS-8954 audit at the source (Claude Design) via the DesignSync write flow, then pulled the corrected bundle:

- **Light theme removed** — deleted the `.theme-light` / `[data-theme='light']` token override block from `assets/colors_and_type.css` and every `[data-theme='light']` rule in `styles.css` (9 blocks). The app is dark-mode only per `docs/design/brand.md`. Also removed the now-dead Dark/Light toggle from the mockup's Tweaks panel and updated stale "light theme" copy in `Nav Bar System.html`.
- **Fonts switched to Google Fonts CDN** — replaced the self-hosted `@font-face` declarations (30 `.woff2` files under `assets/fonts/`) with a single Google Fonts `@import` for Big Shoulders Display + Literata. Removed the JetBrains Mono import and the `'Oswald'` fallback from `--font-display` (neither is brand-approved). `--font-mono` now falls back to the system monospace stack only.
- **Off-palette hex fixed** — replaced raw/off-palette colors with canonical tokens: `#111` → `var(--bg)`, `#e63950` / `--brand-seam-red-light` → `var(--brand-seam-red)` (token removed — not in the brand palette table), and the hardcoded `#8b1a2b`→`#c41e3a` ticker-live gradient → `var(--grad-seam)` / `var(--brand-seam-red-dark)`. `#edf1f7`, `#cbd5e1`, `#b8942b` were inside the deleted light-theme block.
- **Breakpoints aligned to the canonical bands** — invented `max-width: 1200px` / `760px` media queries replaced with `1119px` (below `xl`/1120) and `659px` (below `xs`/660), matching `docs/agents/pages/PROMPT.md` / `lib/design-tokens/src/lib/breakpoints.ts`.
- **Debug PNG cleanup** — deleted `debug-mobile.png` through `debug-mobile5.png` from the project root.
- **postMessage target-origin hardened** — the review bot flagged `window.parent.postMessage(..., '*')` in the EDITMODE protocol (HIGH, security) as a required change. The mockup is embedded in Claude Design's own editor iframe at whatever origin hosts that session, so a fixed hostname isn't possible; derived the target origin from `document.referrer` instead, falling back to `'*'` only when no referrer is present (unchanged behavior for that edge case).

## Deliberately not attempted this pass — flagged for human-led follow-up

- **Missing core states** (loading / error / empty + a visible state switcher, per PROMPT.md's Conditional States + Deliverable Checklist) are still absent. This mockup is a component-system showcase (React+Babel runtime driving `NavBars.jsx` / `NavParts.jsx` / `NavPopovers.jsx`, ~2,300 lines across 4 files) rather than a single state-driven page mockup — adding a real loading/error/empty/populated switcher is a design decision that reshapes the file's structure, not a mechanical fix. Per the ticket's own note, this needs a human-led Claude Design session.
- **Runtime React 18 + Babel from unpkg** (should be a static HTML mockup per PROMPT.md "What This Session Produces") and the **21 hover-only interactive rules missing `:focus-visible`/`:focus`/`[disabled]`** were flagged in the audit but are out of scope for this ticket's explicit mechanical-fix list (light theme, fonts, off-palette hex, breakpoints, debug-PNG cleanup) — noted here so they aren't lost.

## Files

```
legacy-sports-nav-bar/README.md
legacy-sports-nav-bar/chats/chat1.md
legacy-sports-nav-bar/chats/chat2.md
legacy-sports-nav-bar/project/Nav Bar System.html
legacy-sports-nav-bar/project/NavBars.jsx
legacy-sports-nav-bar/project/NavParts.jsx
legacy-sports-nav-bar/project/NavPopovers.jsx
legacy-sports-nav-bar/project/assets/colors_and_type.css
legacy-sports-nav-bar/project/assets/icons/brand/award.svg
legacy-sports-nav-bar/project/assets/icons/brand/baseball.svg
legacy-sports-nav-bar/project/assets/icons/brand/bell.svg
legacy-sports-nav-bar/project/assets/icons/brand/commissioner.svg
legacy-sports-nav-bar/project/assets/icons/brand/draft.svg
legacy-sports-nav-bar/project/assets/icons/brand/football.svg
legacy-sports-nav-bar/project/assets/icons/brand/league.svg
legacy-sports-nav-bar/project/assets/icons/brand/live.svg
legacy-sports-nav-bar/project/assets/icons/brand/matchup.svg
legacy-sports-nav-bar/project/assets/icons/brand/roster.svg
legacy-sports-nav-bar/project/assets/icons/brand/scoreboard.svg
legacy-sports-nav-bar/project/assets/icons/brand/secure.svg
legacy-sports-nav-bar/project/assets/icons/brand/standings.svg
legacy-sports-nav-bar/project/assets/icons/brand/stats.svg
legacy-sports-nav-bar/project/assets/icons/brand/trophy.svg
legacy-sports-nav-bar/project/assets/icons/brand/zap.svg
legacy-sports-nav-bar/project/assets/logo.png
legacy-sports-nav-bar/project/frames/ios-frame.jsx
legacy-sports-nav-bar/project/styles.css
```

## Removed since previous sync

```
legacy-sports-nav-bar/project/assets/fonts/*.woff2  (30 files — self-hosted fonts replaced by Google Fonts CDN)
legacy-sports-nav-bar/project/debug-mobile.png
legacy-sports-nav-bar/project/debug-mobile2.png
legacy-sports-nav-bar/project/debug-mobile3.png
legacy-sports-nav-bar/project/debug-mobile4.png
legacy-sports-nav-bar/project/debug-mobile5.png
```
