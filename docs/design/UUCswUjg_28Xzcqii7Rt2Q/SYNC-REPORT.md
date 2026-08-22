# Sync report: Preferences

**Design ID**: `UUCswUjg_28Xzcqii7Rt2Q`
**Source**: `DesignSync` (projectId `019de99b-c7df-7e9d-9f09-20f8b65fcf1d`) — local pull, `designsync-local`
**Synced at**: 2026-08-04T00:00:00.000Z
**Previous hash**: `64096434e764584a0a1940aa2c5b9800ece0bc71f14c46afa4722ba54c0c3dae`
**Bundle hash**: `c4a39b74a1dbbf879929286ae47a7232645f237ad8cf927c9b8df252deb62b37`
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
- **Updated-brief compliance** (`docs/agents/pages/PROMPT.md`'s Deliverable Checklist changed after the original LS-8954 audit ran — this pass targets the current version): added a `<!-- HANDOFF -->` block, a `<!-- BREAKPOINTS -->` annotation claiming `xs`/`sm` (mobile-shares-`xxs`) and `md`/`lg`/`xl` (desktop-shares-`$xxl`) instead of new frames, and `<!-- COMPONENT -->` annotations for the reused settings-row and toggle patterns.
- **Known remaining gap, flagged not fixed**: the `.toggle-pad > .toggle[role=switch]` control is a styled `<div>`, not a native `<input type="checkbox">` — the checklist's "no `<div>` styled to look like a control" item isn't met. This is a shared design-system-wide toggle convention (also used by `components-toggle.html`), not specific to this page; changing it here alone would fork the pattern. Left as-is with a `<!-- HANDOFF -->` note; a design-system-level fix should be its own ticket if desired.

## Post-sync fix: LS-9086 (2026-08-09)

`legacy-sports-preferences/project/uploads/PROMPT.md` was found stale — it still carried the pre-Breakpoints-era "Mobile & Desktop Layouts" section instead of the seven-band `## Breakpoints` section from the canonical `docs/agents/pages/PROMPT.md`. This is the root cause LS-9024 traced for the bundle's missing xs(660)/sm(800)/md(860)/lg(980)/xl(1120) coverage: the design session worked from a checklist that never asked for those bands.

**Deviation from the usual write-then-pull flow**: this fix was applied directly to the repo copy (`legacy-sports-preferences/project/uploads/PROMPT.md`) rather than via `DesignSync.write_files` against the Claude Design project — the `DesignSync` MCP tool requires an interactive `/design-login` that this cloud session cannot run (`get_project` returned a design-system-authorization error). The bundle hash above is therefore **not** re-derived from a fresh pull; it still reflects the LS-8965 sync. A follow-up local session should push this same `PROMPT.md` fix up to the Claude Design project (`projectId 019de99b-c7df-7e9d-9f09-20f8b65fcf1d`) via `/push-design UUCswUjg_28Xzcqii7Rt2Q` (or the DesignSync write flow directly) so the source stays in step, then `/pull-design` to re-derive the hash. Until then, the *next* full re-pull of this project will overwrite this repo-side fix unless the source has also been updated.

Redesigning `project/scratch/mockups/preferences.html` itself to add the missing xs/sm/md/lg/xl frames or `BREAKPOINTS` annotations is out of scope for this ticket — LS-9086's closure AC is the `PROMPT.md` fix; a follow-up design pass against the corrected checklist covers the mockup itself.

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
