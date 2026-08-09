# Sync report: Help

**Design ID**: `V7jS9JECVtF0zt_SkADLhw`
**Source**: `designsync-local` (DesignSync MCP, project `019de997-dc7e-7592-a71f-df4e0ea9f180`)
**Synced at**: 2026-08-04T15:24:04.000Z
**Bundle hash**: `3f2485a209e2b185cda9ae9daa5ce8855dc9237991d76646fc0f8d28a167f01d`
**Files**: 18
**Total size**: 470322 bytes

## LS-9087 addendum (2026-08-09)

LS-9024's Breakpoints audit found `lg` (980px) and `xl` (1120px) unclaimed by
any frame or annotation — the `lg`/`xl` desktop layout was implicit (no
reflow between the 979px mobile edge and the 1280px `xxl` frame) rather than
explicitly claimed per PROMPT.md's checklist. Added a `BREAKPOINTS` comment
in `scratch/mockups/help.html` stating that the unqualified desktop rules
serve `lg`/`xl` as the same layout that anchors at the `xxl` frame, so all
seven bands are now explicitly covered.

**Deviation from the normal design-source-fix pattern**: this session is
Claude Code Remote (CCR); the `DesignSync` tool requires an interactive
`/design-login` that CCR cannot run (`get_project` on `019de997-dc7e-7592-a71f-df4e0ea9f180`
returned "needs design-system authorization... not available in this
environment"). Unlike LS-8966 (fixed at the Claude Design source, then
re-pulled), this fix was applied **directly to the repo bundle** — the only
reachable surface from this session. The Claude Design project itself still
lacks the annotation; a future local session with working `DesignSync` auth
should apply the same comment at the source (project
`019de997-dc7e-7592-a71f-df4e0ea9f180`, `scratch/mockups/help.html`) via
`/push-design` (or the DesignSync write flow) so a subsequent `/pull-design`
doesn't silently revert this fix.

## What changed (vs previous hash `564894d973bbc0a9e76e10d9821dba433f441d87e5b6a1e1f6994cbf8bef9335`)

LS-8966 — re-ran the mechanical fixes from the LS-8954 audit at the DesignSync source (`scratch/mockups/help.html` only; all other bundle files unchanged):

- Dropped the unauthorized JetBrains Mono Google Fonts load and the unused Big Shoulders weight 900; `--font-mono` now aliases `--font-body` (brief allows only Big Shoulders Display + Literata; canonical design system explicitly has "no mono face")
- Corrected the mockup's own stale pre-brief text-ramp hexes (`--fg1`/`--fg2`/`--fg3`) to the canonical `brand.md` values, and replaced the two off-palette one-off strays (`#0f1a30`, `#070b14`) with existing tokens
- Replaced the invented `@media (max-width: 900px)` breakpoint with the canonical 979px edge (just below the `lg` 980px band)
- Added a `--focus-ring` token and `:focus-visible` rules across every interactive component class (covers the 54 flagged buttons/links)
- Tokenized the remaining raw-hex repeats of existing local vars (`#fff`, `#0d1526`, `#1b3a5c`, `#1e2d45`)
- Replaced the real "Babe Ruth (1927) / Mike Trout (2019)" example in the "How does drafting across eras work?" FAQ answer (both desktop and mobile occurrences) with fictional players, per LS-9004 Ruling 2 — this Help page is documentation copy, not a player-data surface, so it doesn't qualify for the real-historical-player exemption
- Added a `<!-- HANDOFF -->` block and `<!-- COMPONENT -->` annotations for the reused `btn`, `tutorial-step`, `chip`, `faq-item`, and `contact-card` patterns

**Deliberately left unchanged** (see the HANDOFF block in `help.html` for the full rationale):
- The extended-ramp brand tints originally flagged by the LS-8954 audit (`#2c4a7c`/`#143050`/`#d4bb78`/`#a68b3e`/`#e63950`/`#6c80ba`/`#4d5d80`) — all confirmed to match sanctioned tokens in the canonical Design System file per LS-9004 Ruling 3
- Other real-player mentions on this page (Walter Johnson in the tutorial copy; Bob Gibson, Josh Gibson, Satchel Paige, Cool Papa Bell in the Historical Stats FAQ) — out of this ticket's named finding (Babe Ruth/Mike Trout only)

No files were truncated or skipped.

## Pages

- `legacy-sports-help/project/scratch/mockups/help.html`

## All files

```
legacy-sports-help/README.md
legacy-sports-help/chats/chat1.md
legacy-sports-help/project/assets/favicon.ico
legacy-sports-help/project/assets/logo.png
legacy-sports-help/project/icons/baseball.svg
legacy-sports-help/project/icons/commissioner.svg
legacy-sports-help/project/icons/draft.svg
legacy-sports-help/project/icons/league.svg
legacy-sports-help/project/icons/live.svg
legacy-sports-help/project/icons/roster.svg
legacy-sports-help/project/icons/scoreboard.svg
legacy-sports-help/project/icons/secure.svg
legacy-sports-help/project/icons/stats.svg
legacy-sports-help/project/icons/trophy.svg
legacy-sports-help/project/icons/zap.svg
legacy-sports-help/project/scratch/mockups/help.html
legacy-sports-help/project/uploads/PROMPT.md
legacy-sports-help/project/uploads/help.md
```
