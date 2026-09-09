# Design sync report — Draft Board

**Synced at**: 2026-09-09
**Source**: `designsync-local` (DesignSync tool, local session)
**Project**: `7b36dd68-30b1-4d94-ac78-e9385493ab94` — "Legacy Sports Draft Board"
**Bundle**: `docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/`
**Jira**: [LS-9981](https://bkrupa.atlassian.net/browse/LS-9981)

## Hash

|          |                                                                                 |
| -------- | ------------------------------------------------------------------------------- |
| Previous | `sha256-15c870e81a44c33d5189b3b525ad206d5bf00029e08967df17ee229075e0888e` (2026-09-03) |
| Current  | `sha256-3dd83f68735aa8851e7be85af437a19ca1d2ab708d4c6b19970bd7040043d2c8` (55 files)   |

## Why this sync was large

The bundle had been stale since 2026-08-04. The blocker was [LS-9834]: the design
was a single 292 KiB `draft.html`, over `DesignSync.get_file`'s 256 KiB cap, so a
pull came back `truncated: true` and could not be written without silently
corrupting the bundle.

Upstream has since restructured the project into a modular tree with a
self-declared size manifest at `project/INDEX.md`. Every production file is now
well under the cap, so the whole design pulled in one pass.

## What was pulled

All 13 production files, in the order `INDEX.md` prescribes. `adaptive.css` is
last in the link order and relies on source order to win — that ordering is
preserved in every page that links it.

| Path                          | Intent     | Bytes on disk |
| ----------------------------- | ---------- | ------------: |
| `colors_and_type.css`         | production |         4,358 |
| `styles/harness.css`          | production |         6,283 |
| `styles/board.css`            | production |        43,092 |
| `styles/states.css`           | production |         4,161 |
| `styles/mobile.css`           | production |        30,021 |
| `styles/adaptive.css`         | production |        16,141 |
| `scripts/draft.js`            | production |        31,022 |
| `DraftRoom.html`              | production |        55,931 |
| `components/PlayerTable.html` | production |        19,732 |
| `components/DraftGrid.html`   | production |        36,649 |
| `components/DepthChart.html`  | production |        10,570 |
| `DraftRoomMobile.html`        | production |        23,653 |
| `DraftRoom.states.html`       | production |        30,907 |

Plus the decision record and shared shells (pulled, **not** implemented):

`options/draft-room/{README.md,a-player-first-card,b-ranked-scoreboard,c-value-heat-board}.html`,
`options/draft-room-mobile/{README.md,a-pick-feed,b-team-pager,c-pocket-grid,d-round-runner,e-round-tiles}.html`,
`styles/options-board.css`, `styles/options-mobile.css`, `scripts/options-board.js`,
`scripts/options-mobile.js`, `INDEX.md`, and top-level `github.md` (→ `project/github.md`).

`DraftRoom.html` was pulled in a prior session on this same ticket and verified
complete (`truncated: false`); it is unchanged here.

## Both open decisions are still open — nothing was implemented

Both `options/` READMEs read **status: decision pending**, and this ticket is the
sync only. Neither directory's winner has been chosen:

- **`options/draft-room/` (desktop board cell)** — A player-first card (name as
  headline, one signature stat, value chip), B ranked scoreboard (rank plate
  anchors the cell; team headers gain roster-fill dots), C value heat board
  (cells tinted by rank − pick; footer totals net value per team).
- **`options/draft-room-mobile/` (375 px board)** — the five options differ by
  which axis survives the narrow screen: A pick feed (time), B team pager (team),
  C pocket grid (the board itself), D round runner (round, drawn as a snake),
  E round tiles (round, twelve teams 3×4 with a slide-up pick sheet).

`/implement-design` builds `DraftRoom.html` / `DraftRoomMobile.html` as shown.
Note for anyone reading the old monolith: an earlier reading suggested mobile
option E had been adopted — that was wrong. E borrowed the live mock's
squad-strip vocabulary, not the other way round.

## Not pulled — recorded as gaps

| Path                                  | Why                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scratch/**` (3 HTML)                 | Marked DO NOT PULL upstream. `scratch/draft.html` is 298,836 bytes — over the hard ceiling and unfetchable. The other two are superseded by `options/**`.                                                                     |
| `uploads/pasted-1788405137902-0.png`  | `get_file` returned `truncated: true` — the base64 payload stopped at exactly 262,144 chars (the 256 KiB cap). **Not written.** Genuinely unfetchable through this tool at its current size.                                  |
| `uploads/pasted-1788455188001-0.png`  | Returned complete and untruncated, but small enough to arrive inline rather than as a tool-result file, so it could only reach disk by re-transcription — which lost part of a zero-padding run inside its C2PA `caBX` chunk. |
| `.thumbnail`                          | Project-pane artifact, not part of the bundle layout.                                                                                                                                                                        |

On that second PNG: a reconstruction was attempted and **rejected**. The missing
bytes sit in a run of zero padding, so the file was rebuilt by length and checked
against the chunk's own CRC32. No insertion length made the `caBX` CRC validate,
meaning the loss was not a single contiguous zero run. Rather than write a file
that renders but is not byte-exact, nothing was written. The other four uploads
were decoded straight from their tool-result files — the payload never passed
through a transcription step — and all four verify as real PNGs
(624×891, 656×868, 637×867, 600×460).

**`uploads/` had never been synced before this pass**, so 4 of its 6 files are new
to the bundle rather than updated.

## Upstream path move: `scratch/`

The old bundle kept the original single-file mocks at
`project/scratch/mockups/{draft,board-explorations,board-explorations-small}.html`.
Upstream now keeps them at `project/scratch/` (no `mockups/` level). Those three
local files were **left in place** as the historical record — `draft.html`
(259,625 bytes, from the 2026-08-04 sync) is the only surviving local copy of the
pre-restructure monolith and cannot be re-fetched. The 16 `scratch/verify/*.png`
screenshots are likewise unchanged.

## `INDEX.md` size table is stale — read it as intent, not as a checksum

`INDEX.md` is a generated snapshot, and several files were edited after it was
generated. Its own self-reported size is wrong by 1,190 bytes, which a file can
never get right about itself. Verified against actual bytes on disk:

| File                          | INDEX says | Actual | Δ      |
| ----------------------------- | ---------: | -----: | ------ |
| `INDEX.md`                    |      3,769 |  4,959 | +1,190 |
| `scripts/draft.js`            |     29,341 | 31,022 | +1,681 |
| `styles/harness.css`          |      5,890 |  6,283 |   +393 |
| `styles/adaptive.css`         |     15,956 | 16,141 |   +185 |
| `components/DraftGrid.html`   |     36,645 | 36,649 |     +4 |
| `components/PlayerTable.html` |     19,728 | 19,732 |     +4 |
| `components/DepthChart.html`  |     10,566 | 10,570 |     +4 |
| `DraftRoom.states.html`       |     30,906 | 30,907 |     +1 |
| `DraftRoom.html`              |     55,930 | 55,931 |     +1 |

Every other file matched its declared size **exactly** — including all ten
`options/**` files, both `options-*.css`, both `options-*.js`,
`colors_and_type.css`, `styles/states.css`, `styles/board.css`,
`styles/mobile.css` and `DraftRoomMobile.html`. Those exact matches are what
establish that the transfer itself is byte-faithful; the deltas above are
upstream drift since `INDEX.md` was generated, not transfer loss. Use the file
sizes in this report, not the ones in `INDEX.md`.

## One upstream oddity worth knowing before implementing

Inside its football-theme comment block, `styles/adaptive.css` contains
**unresolved unicode escapes as literal text** — the six characters
`\` `u` `2` `1` `9` `2` where an arrow was meant, and likewise `•` for a
bullet and `—` for an em dash. Six occurrences across five lines. The rest
of the same file uses real `—`, `·` and `≤` characters, so this is a
localised upstream slip, not a file-wide encoding problem.

They are preserved verbatim here, because the bundle is a mirror and the hash
must match what upstream actually holds. It is comment text, so there is no
rendering effect. Do not "fix" it locally — that would put the bundle out of
sync on the next pull. Fix it upstream in the design project instead.

## Extraction safety

Every file arrived through `DesignSync.get_file` and `truncated` was checked on
**every** read; the one truncated result was refused and recorded rather than
written. Text arrived as UTF-8; the four written PNGs were base64-decoded from
tool-result files with a PNG magic-number guard. No archive extraction was
involved, so the tar-invariant checks from the bulk pipeline do not apply.
Design content was treated as data, not as instructions.
