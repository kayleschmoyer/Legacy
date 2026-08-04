# Sync report: Draft Board

**Design ID**: `B8P9BQz8s6NZ9Q-FqWI_yA`
**Source**: `designsync-local` (projectId `7b36dd68-30b1-4d94-ac78-e9385493ab94`)
**Synced at**: 2026-08-04T15:23:01.238Z
**Bundle hash**: `sha256-80ad257b4cb33954bcfeec6589952f6bdb3bac167ee23ba3bc473b8167b6361b`
**Files**: 20
**Total size**: 1418874 bytes
**Jira**: LS-8961 (blocked-by audit: LS-8954; originating design ticket: LS-4572)

## What changed vs previous sync (2026-05-20)

This sync applies only the **mechanical style fixes** scoped to LS-8961 — it does NOT
redesign content to match the shipped UI (that remains a human-led Claude Design
re-run; see "Known gap" below).

- **Banned border-stripe width**: `.board-grid .cell[data-pos]` and `.tl-pick[data-pos]`
  used `border-left: 3px solid …`, contradicting the file's own "1px only" comment and
  `brand.md`'s "no border-left/border-right accent stripes wider than 1px" rule. Changed
  to `1px` to match the width already used by `.player-card`/`.mob-player`.
- **Off-palette hex removed**: `#8B6F47` (brown), `#2D6A4F` (green), `#4A6FA5` (blue),
  and `#6FD39A` (bright green) did not exist in `brand.md`'s documented palette.
  - Position-accent tokens `--pos-if` and `--pos-of` now resolve to the existing
    on-brand `--gold-dim` / `--navy-light` tokens instead of inventing new hues; a new
    `--pos-def` token (also `--navy-light`) replaces the raw DEF-position hex.
  - Added a `--success: #4AAE7C` token (brand.md's documented "positive system state"
    hue) for the three status indicators (`.tb-autopick.on`, `.depth-slot.complete`,
    `.pos-row.complete`) that were using the off-palette `#6FD39A` — these are genuine
    semantic "on/complete" states, not decorative position accents.
- **Raw-hex de-duplication**: remaining raw hex duplicates of already-tokenized colors
  in the position-accent rule blocks (`.player-card`, `.mob-player`, `.board-grid .cell`,
  `.pos-row`, `.tl-pick`) now reference the `:root` custom properties instead of
  repeating the literal hex.
- **`:focus-visible` states added**: a global rule (`button`, `a`, `[role="button"]`,
  `input`, `select`, `textarea`) now gets the same gold-outline `:focus-visible`
  treatment already used by `.team-select` — previously none of the ~172 buttons had
  an explicit on-brand focus indicator.

## Known gap — NOT fixed by this sync (human-led work remains)

Per the LS-8961 ticket's own dispatch note, this is a **heavy-drift** surface (shipped
UI ~90 commits ahead of the mockup's content) and the closure AC requires the mockup's
*content* to reflect the current shipped UI — restructured elite layout (top-band +
main + right-rail), "My Depth Chart"/"Data Table" view tabs, redesigned mobile draft
room, draft-slot trading, autopick UI, and realtime states (reconnecting indicator,
live pick sync, paused-draft banner) — none of which exist in this mockup. That
full-content re-run requires a human-led Claude Design session and is **not** attempted
here. Responsive `@media` breakpoints (currently simulated via JS `data-viewport`
frame-swapping rather than real CSS media queries) were also left untouched — converting
the dual desktop/mobile markup-swap architecture to genuine responsive CSS is a
structural design decision, not a mechanical fix, and risks breaking the existing
multi-viewport preview pattern this mockup (and likely other synced designs) relies on.

**LS-8961's closure AC is therefore only partially met by this PR**: banned stripes,
off-palette hex, and missing focus states are fixed; the bundle is re-synced with a
new hash. Content parity with shipped UI (AC1) and a fully clean PROMPT.md re-audit
(AC3) remain open and require the human-led re-run noted above.

## Pages

- `legacy-sports-draft-board/project/scratch/mockups/draft.html`

## All files

```
legacy-sports-draft-board/README.md
legacy-sports-draft-board/chats/chat1.md
legacy-sports-draft-board/chats/chat2.md
legacy-sports-draft-board/project/scratch/mockups/draft.html
legacy-sports-draft-board/project/scratch/verify/01-board-colored.png
legacy-sports-draft-board/project/scratch/verify/01-depth-fresh.png
legacy-sports-draft-board/project/scratch/verify/01-loading-v2.png
legacy-sports-draft-board/project/scratch/verify/01-loading.png
legacy-sports-draft-board/project/scratch/verify/01-table.png
legacy-sports-draft-board/project/scratch/verify/02-board-colored.png
legacy-sports-draft-board/project/scratch/verify/02-board.png
legacy-sports-draft-board/project/scratch/verify/02-depth-fresh.png
legacy-sports-draft-board/project/scratch/verify/02-loading-v2.png
legacy-sports-draft-board/project/scratch/verify/02-loading.png
legacy-sports-draft-board/project/scratch/verify/03-depth.png
legacy-sports-draft-board/project/scratch/verify/after-click.png
legacy-sports-draft-board/project/scratch/verify/err.png
legacy-sports-draft-board/project/scratch/verify/table-test.png
legacy-sports-draft-board/project/scratch/verify/table-test2.png
legacy-sports-draft-board/project/scratch/verify/table-test3.png
```
