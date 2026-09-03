# Design sync report — Draft Board

**Synced at**: 2026-09-03
**Source**: `designsync-local` (DesignSync tool, local session)
**Project**: `7b36dd68-30b1-4d94-ac78-e9385493ab94` — "Legacy Sports Draft Board"
**Bundle**: `docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/`
**Jira**: [LS-8961](https://bkrupa.atlassian.net/browse/LS-8961)

## Hash

| | |
| --- | --- |
| Previous | `sha256-80ad257b4cb33954bcfeec6589952f6bdb3bac167ee23ba3bc473b8167b6361b` (2026-08-04) |
| Current | `sha256-15c870e81a44c33d5189b3b525ad206d5bf00029e08967df17ee229075e0888e` (22 files) |

## What changed

Two new mockups pulled, both complete (`truncated: false`):

| Path | Status | Contents |
| --- | --- | --- |
| `project/scratch/mockups/board-explorations.html` | **new** | Desktop cell-density study — 3 options (A player-first card, B ranked scoreboard, C value heat board) |
| `project/scratch/mockups/board-explorations-small.html` | **new** | Small-viewport study at 375 px — 5 options (A pick feed, B team pager, C pocket grid, D round runner, E round tiles) |

Unchanged in this sync: `project/scratch/verify/*.png` (16 files), `chats/`, `README.md`.

## Not pulled in this pass

Recorded as gaps rather than silently skipped:

| Path | Why |
| --- | --- |
| `uploads/` (6 PNGs) | Directory is absent from the local bundle entirely — never synced. Binary assets round-trip through base64; deferred to keep this pass cheap. 3 are recent (≈2026-08-30 → 09-02), 3 older (≈2026-07-26). |
| `project/scratch/mockups/draft.html` | Exists locally at 259,625 bytes — within 1 % of the 256 KiB `get_file` cap. **Not re-fetched, so not verified against remote.** Local copy is from the 2026-08-04 sync. |
| `.thumbnail` | Project-pane artifact, not part of the bundle layout. |

`draft.html` is the one to re-pull if you want a byte-exact bundle — flag it and it can be fetched and diffed.

## Extraction safety

Both files arrived as UTF-8 text through `DesignSync.get_file` (no archive extraction, so the tar-invariant checks from the bulk pipeline don't apply). `truncated` was `false` on both reads. Content was treated as data, not instructions.
