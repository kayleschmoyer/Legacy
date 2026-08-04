# Sync report: Players Page

**Design ID**: `F89Q4j6WFCFqqsZpQ4VhlQ`
**Source**: `DesignSync` MCP tool (local), projectId `019dd2d6-75a1-7916-8566-672f7d4189fa`
**Synced at**: 2026-08-04T00:00:00.000Z
**Bundle hash**: `sha256-afeb263bfe15375cb2feb15dc59e1f613a3a76c9e775e8faf7d8885c8bab756b`
**Ticket**: LS-8962

## What changed vs. the previous sync (2026-05-20)

This is a **mechanical-fix-only** sync, scoped per LS-8962 to the four MED/HIGH
findings from the LS-8954 audit that don't require content judgment. It is
**not** a full re-run against the updated `PROMPT.md` brief — that remains a
human-led Claude Design session (blocked on human availability; see ticket).

Fixes applied at the source (Claude Design project, then pulled back here):

- **Light theme removed** — deleted the `.theme-light` / `[data-theme='light']`
  override block from `ds/colors_and_type.css`. Brand rule: "No light-theme
  surfaces anywhere ... including token files."
- **Off-palette hex replaced with on-palette DS tokens**:
  - `players.css`: `--pos-qb: #D9A140` → `var(--warning)` (`#C89452`, already
    the DS "amber — muted dugout lamp" token); `--pos-wr: #2D6A4F` →
    `var(--pos-outfield)` (same value, now sourced from the DS token instead
    of a duplicated literal). Dependent gradient stops (`.pp-card-mug.amber`,
    `.pp-card-mug.green`, `.pp-list-mug.amber`, `.pp-list-mug.green`,
    `.ls-sportswitch-btn.sw-football.on`) updated to reference the same
    tokens.
  - `ds/ui_kits.css`: `.ls-chip-active` (`#22C55E`) and `.ls-chip-soon`
    (`#F59E0B`) recolored to the DS `--success-fg` / `--warning-fg` tokens
    (and their rgba fill/border triplets) instead of generic Tailwind-style
    green/amber.
- **Invented viewport breakpoints replaced with canonical bands** —
  `players-data.jsx`'s `VIEWPORTS` design-tool switcher used
  375/480/768/1024/1280 (not in the DS breakpoint scale). Replaced with the
  canonical `$xs/$sm/$md/$lg/$xl/$xxl` bands from the Design System's
  `breakpoints.html` reference: 660/800/860/980/1120/1280.
- **`:focus-visible` added** — the bundle had zero keyboard-focus styling.
  Added `outline: 2px solid var(--focus-ring); outline-offset: 2px;` rules
  in `ds/ui_kits.css` (nav/tab/button primitives) and `players.css` (page
  chrome: viewport bar, sport switch, filters, pills, table headers, cards,
  list rows).

Everything else (HTML/JSX structure, copy, data, layout, non-flagged colors)
is **unchanged** — this sync deliberately does not attempt the current-UI
content re-run (stats browser toolbar, Player Comparison, sport-agnostic
shell, filter rail, obsolete modal interaction, mobile card feed scope,
Era/Position scaffold decision). That remains open for a human-led session
against `uploads/PROMPT.md` (itself still referencing the old WebFetch
pre-read step and pre-audit palette — also needs a human pass).

## All files

Unchanged from the 2026-05-20 sync's file listing (66 files) except content
changes to `ds/colors_and_type.css`, `ds/ui_kits.css`, `players.css`, and
`players-data.jsx` as described above.
