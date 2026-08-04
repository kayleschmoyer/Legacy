# Sync report: Stats Page

**Design ID**: `qtqqKYxMFf1A8GY5NL9GNQ`
**Source**: `designsync-local` (DesignSync MCP tool), projectId `26a15a22-caeb-49e6-b5c3-1604c76ea778`
**Synced at**: 2026-08-04T15:47:49.000Z
**Bundle hash**: `sha256-91c39db9bcc8631f3136ba77d5456a2496bb9df24680f17ccf29d0df9702a889`
**Previous hash**: `3e7ea17c02c49145813c3bbfe739677e4f2be48a0d626066b7fa411fa6c789d6`
**Files**: 19
**Jira**: LS-8975 (re-run against updated PROMPT.md brief; originating epic LS-4568)

## What changed vs. the previous sync

Fixed the mechanical violations flagged by the LS-8954 audit, at the source in the Claude Design project, then re-synced:

- **Duplicate `:root` block** — `stats.css` declared a second `:root` for football position tokens on top of `ds/colors_and_type.css`'s. Merged into the single `:root` in `ds/colors_and_type.css`.
- **Off-palette / mismatched position tokens** — `--pos-catcher`/`--pos-infield`/`--pos-outfield` etc. are confirmed to already match the app's authoritative `lib/design-tokens/src/lib/colors.ts` (`positions`, LS-8578/LS-8526) — not invented, kept as-is with a sourcing comment. However `--pos-def-lb`/`--pos-def-dl`/`--pos-def-db` were duplicating other positions' colors instead of using their own distinct `footballPositionBadges` values — corrected to `#9b7a3d` (LB), `#c25a2a` (DL), `#1b3a5c` (DB, which also covers Safety — no dedicated `S` key exists upstream). Folded the two `def-s` data rows (Ronnie Lott, Ed Reed) and the legend entry into `def-db`.
- **Raw gradient hex duplicated instead of tokens** — `.sp-sport-btn.sp-sport-baseball.on` / `.sp-sport-football.on` used raw `#8b1a2b`/`#c41e3a`/`#1b3a5c`/`#2c4a7c` gradient stops instead of the already-declared brand variables; now reference `var(--brand-seam-red-dark)`, `var(--brand-seam-red)`, `var(--brand-navy)`, `var(--brand-navy-light)`.
- **Invented breakpoints** — the breakpoint-bar catalogue (375/768/1024/1280/1536) and the container-query thresholds (520/720/900/1400) didn't match the canonical bands in `docs/agents/pages/PROMPT.md` (660/800/860/980/1120/1280). Replaced with `xxs`/`xs`/`md`/`lg`/`xxl` bands and matching container-query thresholds (659/799/859/1280).
- **Missing `:focus-visible`** — none of the ~18 buttons or the sortable table headers had an explicit focus style. Added a 2px `var(--fg1)` outline rule (per the brief: TEXT_PRIMARY outline, gold reserved for outcomes) covering every interactive element, and made the sortable `<th>` elements keyboard-operable (`tabIndex`, `role="button"`, `onKeyDown`).
- **Self-hosted fonts + JetBrains Mono** — replaced 26 self-hosted `@font-face` declarations (Big Shoulders Display + Literata) with a single Google Fonts CDN `@import`, per the brief's explicit CDN requirement. Dropped the separately-loaded JetBrains Mono; `--font-mono` now falls back to the system monospace stack only — the brief permits "Literata or mono" for stat values but names no third brand typeface. Deleted the 30 now-unused `.woff2` files from the bundle.
- **Banned light-theme block** — the updated brief added an explicit ban on `.theme-light`/`[data-theme='light']` token overrides (this app is dark-mode only). Removed the block from `ds/colors_and_type.css` (this predates the LS-8954 audit's checklist but is required by the current brief).
- Minor token-discipline cleanup: replaced a handful of repeated raw `#fff` values with `var(--fg1-strong)` (exact same color, already declared).

## Not changed

- Real historical MLB/NFL players in `sports-data.jsx` — ruled acceptable for player-data surfaces per LS-9004.
- No annotations (LOW finding) — out of scope for this mechanical-fix pass.

## Skipped / truncated files

None — all fetches succeeded, nothing truncated.
