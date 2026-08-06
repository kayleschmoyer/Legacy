# Sync report: Legacy Baseball Minigames

**Design ID**: `2ZKwS1lG5Pb1Z6NcPzNW7g`
**Source**: `designsync-local` (projectId `f1c2ee9f-859c-4136-bb9f-7d6fe6a2c832`)
**Synced at**: 2026-08-06T18:38:59.295Z
**Bundle hash**: `c1341835cd8eedaa43731ae7d7fd81e3edab70c42abdffd4e1418e62b1e0e3e6`
**Files**: 67
**Sync ticket**: LS-9018 (state switcher + loading skeletons, follow-up to LS-8959)

## What changed vs. previous hash (`178a15e9c541...`)

Design additions made at the source via the DesignSync write flow, then pulled back — the deliberate design pass LS-8959 intentionally deferred:

- **New `components/StateSwitcher.jsx`**: shared `StateSwitcher` (button-tab preview control), `Skel` (shimmer primitive), `ErrorCard`, and `EmptyCard` components, reused by every screen.
- **`styles.css`**: added the shimmer `@keyframes`, `.skel`, `.state-switcher`, `.state-error-card`, and `.state-empty-card` rules (respects `prefers-reduced-motion`).
- **`Hub.jsx` / `styles-hub.css`**: state switcher + a skeleton mirroring the hero (copy + hero-mark) and the two game-card tiles; error and empty (maintenance) states.
- **`Disclosure.jsx`**: state switcher + a skeleton mirroring the idle card; error (mystery-player fetch failed) and empty (no player queued today) states, gating ahead of the existing idle/playing/result phases.
- **`SeasonDraftLobby.jsx`**: state switcher + a skeleton mirroring the section head and card grid; error state. The pre-existing data-driven empty state (`.sdl-empty`) is now also reachable from the switcher.
- **`SeasonDraftCreate.jsx`**: state switcher + a skeleton mirroring the preview card and settings form; error and empty (no stat categories) states.
- **`SeasonDraftJoin.jsx` / `styles-join.css`**: replaced the old generic `.sdj-loading`/`.sdj-spinner` with a skeleton mirroring the invite ticket (name, detail grid, 6-seat row, code, actions) — a spinner doesn't mirror layout geometry per PROMPT.md; added error (expired invite) and empty (game full) states.
- **`SeasonDraftGame.jsx`**: state switcher + a skeleton mirroring the header, draft-step card, rosters, scoreboard, and history; error and empty (player pool exhausted) states, alongside the pre-existing setup/drafting/completed phase toggle.
- **`Legacy Minigames.html`**: `<script>` tag for the new `StateSwitcher.jsx`; `<!-- HANDOFF -->` block rewritten to describe the switcher/skeleton pass and remove the stale "no state switcher" open question.

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
legacy-baseball-minigames/project/components/StateSwitcher.jsx
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
