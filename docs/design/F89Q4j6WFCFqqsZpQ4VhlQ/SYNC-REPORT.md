# Sync report: Players Page

**Design ID**: `F89Q4j6WFCFqqsZpQ4VhlQ`
**Source**: `DesignSync` MCP tool (local), projectId `019dd2d6-75a1-7916-8566-672f7d4189fa`
**Synced at**: 2026-08-10T00:00:00.000Z
**Bundle hash**: `sha256-f69d00a11bfbc79bcca342e07c3e70c927dc32944f2a33c983387dbe6b6e6d92`
**Ticket**: LS-9090

## What changed vs. the previous sync (2026-08-04, LS-8962) — this sync

Fix-at-the-source for the PROMPT.md Breakpoints checklist gap flagged by
LS-9024/LS-9090: the seven canonical bands
(`lib/design-tokens/src/lib/breakpoints.ts`: xxs 0 / xs 660 / sm 800 / md 860
/ lg 980 / xl 1120 / xxl 1280) weren't each covered by a designed frame or an
explicit `BREAKPOINTS` annotation.

- **`players.css`** — the page already had a working container-query
  responsive system (`.pp-viewport-frame`), but its four reflow thresholds
  (1100/900/700/520px) were invented widths, not snapped to the canonical
  bands. Retuned to 1119/979/799/659px so each threshold sits exactly at a
  band boundary, and added `BREAKPOINTS:` comments above each rule (and a
  summary block at the top of the container-query section) documenting which
  band(s) each tier covers: xl+xxl share the base/unoverridden desktop
  layout; lg gets its own tier; sm+md share a tier; xs gets its own tier;
  xxs gets its own (deepest) tier — a fully designed phone frame. Also
  re-pinned the design-tool viewport-bar's own `@media` breakpoint (720px →
  659px) to the same xxs boundary instead of an unrelated invented width.
- **`players-data.jsx`** — the LS-8962 sync had replaced the original
  375/480/768/1024/1280 `VIEWPORTS` preview list with the canonical
  660/800/860/980/1120/1280 bands, which correctly removed the *invented*
  widths but also dropped the `375` phone preview entirely. Per PROMPT.md
  ("`xxs` ... Phones (design at 375px)"), 375px is the canonical *design*
  width for the xxs band (which itself starts at 0), not an invented
  threshold — re-added it as a `$xxs` (375px) entry so xxs has an explicit,
  previewable, fully designed frame per the Breakpoints checklist's AC.

No other files changed in this sync.

## Previous sync (2026-08-04, LS-8962)

**Bundle hash**: `sha256-afeb263bfe15375cb2feb15dc59e1f613a3a76c9e775e8faf7d8885c8bab756b`

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
