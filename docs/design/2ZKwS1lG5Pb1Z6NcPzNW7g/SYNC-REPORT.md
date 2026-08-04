# Sync report: Legacy Baseball Minigames

**Design ID**: `2ZKwS1lG5Pb1Z6NcPzNW7g`
**Source**: `designsync-local` (projectId `f1c2ee9f-859c-4136-bb9f-7d6fe6a2c832`)
**Synced at**: 2026-08-04T15:23:01.000Z
**Bundle hash**: `178a15e9c541dc9f1f4f7c6139836e485ef531d37d1cf7291ce9349f67fdd258`
**Files**: 66
**Total size**: 2418249 bytes
**Sync ticket**: LS-8959 (re-run of the mockup against the updated `docs/agents/pages/PROMPT.md` brief)

## What changed vs. previous hash (`6edadff6...`)

Mechanical fixes applied at the source via the DesignSync write flow (LS-8954 audit / LS-8959), then pulled back:

- **`styles-game.css`**: `.sdg-hist.me` gold accent stripe narrowed from a banned 2px `border-left` to 1px.
- **All 7 `styles*.css` files**: every `@media (max-width: …)` query snapped to the canonical breakpoint bands (660/800/860/980/1120/1280) — no more invented 480/560/640/720/900/1100 thresholds. `styles-create.css`'s existing 860px query was already canonical and is unchanged.
- **`styles.css`, `styles-disclosure.css`, `styles-lobby.css`**: raw hex repeats (`#E63950`, `#C5A55A`) replaced with the existing `--brand-seam-red-light` / `--brand-gold` / `--brand-gold-dark` custom properties; added a global `:focus-visible` rule (2px `--fg1` outline) plus a few per-control overrides where `:hover` was already painting over the default outline.
- **`styles-create.css`, `styles-disclosure.css`, `styles-hub.css`, `styles-join.css`, `styles-game.css`**: raw `font-family: 'Literata', serif` declarations replaced with `var(--font-body)`.
- **`Legacy Minigames.html`**: added a `<!-- HANDOFF -->` block at the top; `styles*.css` files gained `MOTION`, `COMPONENT`, and `BREAKPOINTS` annotation comments (previously zero across the bundle).

**Not fixed here (flagged for a human-led design pass, per LS-8959 scope)**: the bundle still has no visible state switcher and no loading-skeleton state for any screen — those are design additions, not mechanical fixes, so they were intentionally left for a follow-up design session rather than invented in this pass.

## Pages

- `legacy-baseball-minigames/project/Legacy Minigames.html`

## All files

```
legacy-baseball-minigames/README.md
legacy-baseball-minigames/chats/chat1.md
legacy-baseball-minigames/project/Legacy Minigames.html
legacy-baseball-minigames/project/assets/logo.png
legacy-baseball-minigames/project/colors_and_type.css
legacy-baseball-minigames/project/components/Disclosure.jsx
legacy-baseball-minigames/project/components/Hub.jsx
legacy-baseball-minigames/project/components/SeasonDraftCreate.jsx
legacy-baseball-minigames/project/components/SeasonDraftGame.jsx
legacy-baseball-minigames/project/components/SeasonDraftJoin.jsx
legacy-baseball-minigames/project/components/SeasonDraftLobby.jsx
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-baseball-minigames/project/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-cyrillic.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-greek-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-greek.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-latin.woff2
legacy-baseball-minigames/project/fonts/Literata-italic-400-vietnamese.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-cyrillic.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-greek-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-greek.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-latin.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-400-vietnamese.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-cyrillic.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-greek-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-greek.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-latin-ext.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-latin.woff2
legacy-baseball-minigames/project/fonts/Literata-normal-600-vietnamese.woff2
legacy-baseball-minigames/project/icons/award.svg
legacy-baseball-minigames/project/icons/baseball.svg
legacy-baseball-minigames/project/icons/draft.svg
legacy-baseball-minigames/project/icons/live.svg
legacy-baseball-minigames/project/icons/roster.svg
legacy-baseball-minigames/project/icons/scoreboard.svg
legacy-baseball-minigames/project/icons/stats.svg
legacy-baseball-minigames/project/icons/trophy.svg
legacy-baseball-minigames/project/icons/zap.svg
legacy-baseball-minigames/project/screenshots/01-baseball-v3.png
legacy-baseball-minigames/project/screenshots/01-baseball-v4.png
legacy-baseball-minigames/project/screenshots/02-baseball-v3.png
legacy-baseball-minigames/project/screenshots/02-baseball-v4.png
legacy-baseball-minigames/project/screenshots/baseball-check.png
legacy-baseball-minigames/project/screenshots/baseball-v2.png
legacy-baseball-minigames/project/styles-create.css
legacy-baseball-minigames/project/styles-disclosure.css
legacy-baseball-minigames/project/styles-game.css
legacy-baseball-minigames/project/styles-hub.css
legacy-baseball-minigames/project/styles-join.css
legacy-baseball-minigames/project/styles-lobby.css
legacy-baseball-minigames/project/styles.css
legacy-baseball-minigames/project/uploads/pasted-1776580538632-0.png
legacy-baseball-minigames/project/uploads/pasted-1776582380177-0.png
legacy-baseball-minigames/project/uploads/pasted-1776583307329-0.png
```
