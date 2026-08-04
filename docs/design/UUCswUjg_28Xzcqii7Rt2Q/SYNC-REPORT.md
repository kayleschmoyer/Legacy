# Sync report: Preferences

**Design ID**: `UUCswUjg_28Xzcqii7Rt2Q`
**Source**: `DesignSync` (projectId `019de99b-c7df-7e9d-9f09-20f8b65fcf1d`) — local pull, `designsync-local`
**Synced at**: 2026-08-04T00:00:00.000Z
**Previous hash**: `64096434e764584a0a1940aa2c5b9800ece0bc71f14c46afa4722ba54c0c3dae`
**Bundle hash**: `a63af6bae01ebb7669c2fd2b55368eca3eb95a0144ac669e19edc44c35d95aad`
**Files**: 42
**Sync ticket**: LS-8965

## What changed vs. previous sync

Source-level fix for LS-8965 (LS-8954 audit, HIGH/MED findings) applied directly in the Claude Design project via `DesignSync.write_files`, then pulled back into this bundle. Only `legacy-sports-preferences/project/scratch/mockups/preferences.html` changed:

- **Palette**: `body`/`.canvas` background `#060912` → `var(--bg)` (`BG_PAGE #0A0F1A`); `.device` border `#1a233a` → `var(--panel-border)` (canonical `BORDER` token).
- **Fonts**: dropped the third font (`var(--font-mono)` / JetBrains Mono) from the frame-label `.px` caption — now `var(--font-body)` with `tabular-nums`; added a Google Fonts CDN `<link>` for Big Shoulders Display + Literata in `<head>` per `PROMPT.md`'s "load from Google Fonts CDN" requirement (the local self-hosted `woff2` files remain via `colors_and_type.css`, which mirrors `tamagui-config.ts` for the shipped app — that file was not itself a finding).
- **Responsive bands**: `.frame-row` breakpoints `1280px`/`880px` → canonical `1120px`/`860px` ($xl/$md per `docs/design/.../legacy-sports-design-system/project/preview/breakpoints.html`).
- **Focus states**: added `:focus-visible` rules for links, buttons, theme cards, and toggle hit-pads (previously zero).
- **Raw hex → tokens**: 5× `#fff` → `var(--fg-on-accent)`; `#1a1408` (save-banner check-mark ink) → a new page-scoped `--ink-on-gold` token declared in the mockup's own `:root` block (no existing global token matches this exact contrast pairing).
- **Desktop layout (design ADDITION)**: added a 4th frame, **Desktop · 1280px ($xxl)**, with its own template (`tpl-app-desktop`) — persistent top nav + sticky sub-nav rail + single content column (not a scaled-up phone clone); sections stay open (no collapse affordance) since there's room to show everything. Matches the `$xxl` "Top + sidebar" nav pattern and 1280 content-max from the design system's `breakpoints.html`. This closes the previously-missing desktop layout AC.
- **Preserved** (per audit note): the full 4-state switcher with geometry-mirroring skeletons, `role="switch"` toggles with `aria-label`s, and `tabular-nums` on stat values — untouched.

## Pages

- `legacy-sports-preferences/project/scratch/mockups/preferences.html`

## All files

```
legacy-sports-preferences/README.md
legacy-sports-preferences/chats/chat1.md
legacy-sports-preferences/project/design-system/assets/logo.png
legacy-sports-preferences/project/design-system/colors_and_type.css
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-greek.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-greek.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-greek.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-latin.woff2
legacy-sports-preferences/project/design-system/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-preferences/project/design-system/icons/baseball.svg
legacy-sports-preferences/project/design-system/icons/bell.svg
legacy-sports-preferences/project/design-system/icons/football.svg
legacy-sports-preferences/project/design-system/icons/matchup.svg
legacy-sports-preferences/project/design-system/icons/stats.svg
legacy-sports-preferences/project/scratch/mockups/preferences.html
legacy-sports-preferences/project/uploads/PROMPT.md
legacy-sports-preferences/project/uploads/preferences.md
```
