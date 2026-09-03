# Sync report: Public Leagues

**Design ID**: `1tmNnzBvKmDjeJOie3JNkg`
**Source**: `designsync-local` (projectId `02fe66a1-9396-4158-a52e-56a7487d4262`)
**Synced at**: 2026-08-04T15:47:00.000Z
**Bundle hash**: `527e13f10705d61db2c7412aac75c7e930364d74468d56632cf99a75ae770762`
**Files**: 46
**Total size**: 1391001 bytes (project/Legacy Sports - Public Leagues.html grew by ~3.6KB)

## What changed (LS-8958 brief-compliance fixes, targeted pull — only the changed file)

`legacy-sports-public-leagues/project/Legacy Sports - Public Leagues.html`:

- Invented max-width breakpoints (720px, 1320px) replaced with canonical band-aligned thresholds (799px = just below `sm`/800, 1279px = just below `xxl`/1280), each with a `BREAKPOINTS:` annotation comment.
- Added a global `:focus-visible` rule (buttons, links, inputs, `[tabindex]`) plus `:focus-visible` on the two text inputs — the file previously had zero `:focus-visible` rules.
- Tokenized raw hex outside `:root`: `#111827` (→ `var(--bg)`), `#E63950` ×4 (→ `var(--brand-seam-red-light)`), `#fff` ×5 (→ `var(--fg-on-accent)`), plus incidentally-caught exact token matches `#0a0f1a`/`#5B84C4`/`#C89452`/`#6FD39A`/`#E07A8C` (→ `var(--bg)`/`var(--info)`/`var(--warning)`/`var(--success-fg)`/`var(--danger-fg)`). Left `#000` (phone bezel) and `#2a3550` (browser-chrome traffic dot) — review-scaffold-only device-frame chrome with no exact token match, not part of the shipped product per the new HANDOFF note.
- Opening design-intent HTML comment replaced with a proper `<!-- HANDOFF -->` block (final file, key decisions, deviations, open questions) and `<!-- COMPONENT -->` annotations added for `league-card`, `draft-chip`, `stat-row`/`stat-line`, and `state-switcher`.
- Follow-up (review-bot HIGH finding on PR #6678): the review-scaffold's `localStorage.getItem`/`setItem` calls (state persistence across reloads, not part of the shipped product) are now wrapped in `try/catch` — private-browsing/quota errors are swallowed since this persistence is best-effort.

Rationale + full audit: LS-8958 (findings from LS-8954, which rated this bundle "cleanest brand-wise, zero HIGH"). Not touched — out of scope for LS-8958's specific MED/LOW findings: this bundle's own `colors_and_type.css` copy still carries the self-hosted `@font-face` set and the `.theme-light`/`[data-theme='light']` override block that LS-8957 fixed only in the shared Design System project (`colors_and_type.css` is copied per-bundle, not referenced live, so LS-8957's fix did not propagate here automatically). Flagging for LS-9005 (reconciliation sweep) rather than fixing inline, since it wasn't part of this ticket's audited findings.

## LS-9081 (2026-08-09): Breakpoints coverage fix

**Deviation from the standard design-source-fix pattern**: the `DesignSync` MCP tool requires an interactive `/design-login` that this cloud session cannot run (LS-9000 — DesignSync is local-only). This fix was therefore applied directly to the repo bundle rather than at the Claude Design source first. It is annotation-only (no visual/layout change), so the risk of drift is low, but **the Claude Design project (`02fe66a1-9396-4158-a52e-56a7487d4262`) itself was not updated** — a follow-up local session should run `/push-design 1tmNnzBvKmDjeJOie3JNkg` to push this same fix up so the source stays in step, per the write-flow rule in `.agents/skills/design-sync/references/designsync-tool.md`. `lastSyncedHash` in `manifest.json` is intentionally left unchanged (no real pull occurred).

**Closed (2026-09-03)**: pushed `Legacy Sports - Public Leagues.html` to the Claude Design project via `/push-design` from a local session; verified via `get_file` that the live copy now matches this repo bundle. Source and repo are back in step — no manifest hash change (content already matched).

`legacy-sports-public-leagues/project/Legacy Sports - Public Leagues.html`: fixed missing Breakpoints coverage flagged by LS-9024's audit. The two existing `BREAKPOINTS:` comments only described review-scaffold stacking behavior and never explicitly claimed the `sm`–`xl` (800–1279px) bands shared a designed layout. Changes:

- Reworded the `@media (max-width: 799px)` annotation to explicitly claim `xxs`–`xs` (0–799px) coverage (combined with the existing `.m-scroll`-scoped mobile-frame rules).
- Added a new annotation (no CSS change — none needed) explicitly claiming that the base, non-media-queried `.page`/`.hdr`/`.controls`/`.filter-row` rules serve `sm`–`xl` (800–1279px), since nothing restructures in that range and it's the same layout `xxl` ships.
- Reworded the `@media (max-width: 1279px)` annotation to clarify it's review-scaffold-only stage stacking, and to explicitly reconfirm `xxl` (1280px) remains a fully designed frame via `.prod-desktop`.

All seven bands (`xxs`–`xxl`) are now each covered by a designed frame or an explicit `BREAKPOINTS:` annotation; `xxs` (375px) and `xxl` (1280px) remain fully designed frames.

## Pages

- `legacy-sports-public-leagues/project/Legacy Sports - Public Leagues.html`

## All files

```
legacy-sports-public-leagues/README.md
legacy-sports-public-leagues/chats/chat1.md
legacy-sports-public-leagues/project/Legacy Sports - Public Leagues.html
legacy-sports-public-leagues/project/assets/favicon.ico
legacy-sports-public-leagues/project/assets/logo.png
legacy-sports-public-leagues/project/colors_and_type.css
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-600-latin.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-700-latin.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-800-latin.woff2
legacy-sports-public-leagues/project/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-cyrillic-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-cyrillic.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-greek-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-greek.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-latin.woff2
legacy-sports-public-leagues/project/fonts/Literata-italic-400-vietnamese.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-cyrillic-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-cyrillic.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-greek-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-greek.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-latin.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-400-vietnamese.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-cyrillic-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-cyrillic.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-greek-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-greek.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-latin-ext.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-latin.woff2
legacy-sports-public-leagues/project/fonts/Literata-normal-600-vietnamese.woff2
legacy-sports-public-leagues/project/icons/brand/baseball.svg
legacy-sports-public-leagues/project/icons/brand/bell.svg
legacy-sports-public-leagues/project/icons/brand/commissioner.svg
legacy-sports-public-leagues/project/icons/brand/draft.svg
legacy-sports-public-leagues/project/icons/brand/league.svg
legacy-sports-public-leagues/project/icons/brand/live.svg
legacy-sports-public-leagues/project/icons/brand/scoreboard.svg
legacy-sports-public-leagues/project/icons/brand/trophy.svg
legacy-sports-public-leagues/project/uploads/PROMPT.md
legacy-sports-public-leagues/project/uploads/leagues.md
```
