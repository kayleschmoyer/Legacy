# Sync report: Login Page

**Design ID**: `4k4RdTqqAbEop0ZqmEDuOg`
**Source**: DesignSync local (projectId `9e1174b6-61d3-4321-88e2-ff3e318dcfed`)
**Synced at**: 2026-08-04T15:24:57.000Z
**Bundle hash**: `sha256-11464365a6129246318aa1a617d7267b0e74eb337151549e98ce348650af7241`
**Previous hash**: `66dc788c5a266938370ea6d07ec4e9331b7be1bea5d97b8937db789ad365698a`
**Files**: 54
**Total size**: 1522022 bytes

## What changed (LS-8960, closing the remaining LS-8954 audit findings)

Fixed at the source via the DesignSync MCP tool (`get_project` → `list_files` → `get_file` → `finalize_plan` → `write_files`), then pulled back into this bundle:

- **Breakpoints rebuilt on the canonical seven-band scale** (`xxs`/`xs`/`sm`/`md`/`lg`/`xl`/`xxl` per `docs/agents/pages/PROMPT.md`) in `project/src/LoginRoute.css`, replacing the invented 960/640/380px thresholds. `xs`/`sm`/`md` (660–979px) share one single-column centered layout; `lg`/`xl`/`xxl` (980px+) share one two-column split layout; `xxs` (0–659px) is its own compact/mobile frame with fluid `clamp()` type sizing down to a 320px floor.
- **`project/Login Page - Breakpoints.html`** re-pinned from four non-canonical artboards (1280/820/414/360px) to the four canonical reference widths (375 / 660 / 980 / 1280px), with captions naming the bands they represent and which bands share a layout.
- **Explicit `:focus-visible` written out for every interactive element** in `LoginRoute.css` (brand link, nav link, OAuth buttons, email toggle, form inputs, submit button, back link, legal links, tweaks-panel close/option/checkbox controls) — the audit found only one such rule covering 5+ controls.
- **Design-intent annotations added**: `MOTION` comments for every animated/transitioning property, `COMPONENT` comments for the three reusable patterns (brand lockup, stat-cell, auth card, oauth-button), a `BREAKPOINTS` block explaining the band mapping, and a `<!-- HANDOFF -->` block at the top of `project/Login Page.html`.

**Not changed**: OAuth button colors (Discord blurple `#5865F2`, Google white-on-dark) — LS-9004 ruled official third-party OAuth brand treatments exempt from the app's banned-color rules (`docs/design/brand.md` "Third-party brand exemption"). The HIGH audit finding on OAuth colors needed no fix.

**Not fixed here (flagged for human-led follow-up)**: the design still has no auth-error state or four-state switcher. Per `docs/agents/pages/PROMPT.md`'s Conditional States section, a login page needs at minimum a visible error state — that is a design *addition*, not a source fix, and needs product/design input on copy and affordance before an agent should draft it. See LS-8960's ticket notes.

## Pages

- `legacy-sports-login-page/project/Login Page - Breakpoints.html`
- `legacy-sports-login-page/project/Login Page.html`

## All files

```
legacy-sports-login-page/README.md
legacy-sports-login-page/chats/chat1.md
legacy-sports-login-page/chats/chat2.md
legacy-sports-login-page/project/Login Page - Breakpoints.html
legacy-sports-login-page/project/Login Page.html
legacy-sports-login-page/project/check.jpg
legacy-sports-login-page/project/design-canvas.jsx
legacy-sports-login-page/project/ds/colors_and_type.css
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-login-page/project/ds/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-greek.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-latin.woff2
legacy-sports-login-page/project/ds/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-greek.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-latin.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-greek.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-latin.woff2
legacy-sports-login-page/project/ds/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-login-page/project/ds/icons/baseball.svg
legacy-sports-login-page/project/ds/icons/secure.svg
legacy-sports-login-page/project/ds/icons/stats.svg
legacy-sports-login-page/project/ds/icons/trophy.svg
legacy-sports-login-page/project/ds/logo.png
legacy-sports-login-page/project/preview-bundle.tsx
legacy-sports-login-page/project/scraps/canvas.png
legacy-sports-login-page/project/src/BrandPane.tsx
legacy-sports-login-page/project/src/LoginRoute.css
legacy-sports-login-page/project/src/LoginRoute.tsx
legacy-sports-login-page/project/src/OAuthButtons.tsx
legacy-sports-login-page/project/src/TweaksPanel.tsx
legacy-sports-login-page/project/src/headlines.ts
legacy-sports-login-page/project/src/icons.tsx
legacy-sports-login-page/project/src/types.ts
legacy-sports-login-page/project/uploads/pasted-1776583446879-0.png
```
