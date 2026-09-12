# Index — Legacy Sports draft room

Generated 2026-09-09. Sizes in bytes. Authored to `.agents/skills/design-sync/references/design-authoring-guidelines.md`.

| Path | Intent | Surface | Bytes | Notes |
| --- | --- | --- | --- | --- |
| colors_and_type.css | production | — | 4,358 | tokens + base type + link colors; shared by every page |
| styles/harness.css | production | — | 5,890 | review harness only — not production chrome |
| styles/board.css | production | — | 47,555 | nav, hero, draft board, player board |
| styles/states.css | production | — | 4,161 | loading / lobby / error |
| styles/mobile.css | production | — | 30,021 | 375px layouts |
| styles/adaptive.css | production | — | 15,956 | football theme + container/media queries — link LAST |
| scripts/draft.js | production | — | 29,341 | shared harness + interaction script |
| DraftRoom.html | production | draft-room | 55,930 | desktop · populated · Cards view; tabs link into components/ |
| components/PlayerTable.html | production | draft-room | 19,728 | Data Table view |
| components/DraftGrid.html | production | draft-room | 57,613 | Draft Board view — option C value-heat cell |
| components/DepthChart.html | production | draft-room | 10,566 | Depth Chart view |
| DraftRoomMobile.html | production | draft-room | 23,653 | 375px viewport, same surface |
| DraftRoom.states.html | production | draft-room | 30,906 | loading / error / pre-draft, both viewports |
| scripts/options-board.js | option | draft-room | 7,173 | renderers for the desktop options |
| scripts/options-mobile.js | option | draft-room-mobile | 19,869 | guarded renderers for the mobile options |
| styles/options-board.css | option | draft-room | 7,815 | shell for options/draft-room/ — not production |
| styles/options-mobile.css | option | draft-room-mobile | 22,997 | shell for options/draft-room-mobile/ — not production |
| options/draft-room-mobile/a-pick-feed.html | option | draft-room-mobile | 1,951 | status=proposed |
| options/draft-room-mobile/b-team-pager.html | option | draft-room-mobile | 1,829 | status=proposed |
| options/draft-room-mobile/c-pocket-grid.html | option | draft-room-mobile | 1,896 | status=proposed |
| options/draft-room-mobile/d-round-runner.html | option | draft-room-mobile | 1,856 | status=proposed |
| options/draft-room-mobile/e-round-tiles.html | option | draft-room-mobile | 2,707 | status=proposed |
| options/draft-room/a-player-first-card.html | option | draft-room | 1,513 | status=rejected |
| options/draft-room/b-ranked-scoreboard.html | option | draft-room | 1,863 | status=rejected |
| options/draft-room/c-value-heat-board.html | option | draft-room | 2,270 | status=chosen — implemented in components/DraftGrid.html |
| INDEX.md | — | — | 5,186 | this file |
| options/draft-room-mobile/README.md | — | draft-room-mobile | 1,529 | the open question + decision status |
| options/draft-room/README.md | — | draft-room | 2,441 | the open question + the option C decision (2026-09-12) |
| scratch/board-explorations-small.html | scratch | — | 48,478 | DO NOT PULL — superseded by options/draft-room-mobile/ |
| scratch/board-explorations.html | scratch | — | 18,174 | DO NOT PULL — superseded by options/draft-room/ |
| scratch/draft.html | scratch | — | 298,836 | DO NOT PULL — 292 KiB, over the 236 KiB hard ceiling |

**Pull order for implementation:** `colors_and_type.css`, `styles/harness.css`, `styles/board.css`, `styles/states.css`, `styles/mobile.css`, `styles/adaptive.css` (link in exactly this order — `adaptive.css` relies on source order to win), `scripts/draft.js`, then `DraftRoom.html`, `components/PlayerTable.html`, `components/DraftGrid.html`, `components/DepthChart.html`, `DraftRoomMobile.html`, `DraftRoom.states.html`.

**Total production bytes:** 337,947 across 13 files. **Largest production file:** 57,613 (56.3 KiB — `components/DraftGrid.html`) — every production file is under the 60 KiB target, so the whole design pulls in one pass.

**Do not implement:** `options/**` (read each directory's `README.md` — `draft-room` is decided and its winner already lives in `components/DraftGrid.html`; `draft-room-mobile` is still pending) and `scratch/**` (superseded originals, kept as the design record; `scratch/draft.html` is over the hard ceiling and must not be pulled at all).

## Viewport switcher spans two files

`DraftRoom.html` ships the desktop frame; `DraftRoomMobile.html` ships the 375 px phone frame. Selecting a viewport the current page has no frame for **navigates to the file that does**, carrying a `#vp=` hash so the chosen size survives the hop. This is review-harness behavior only (`styles/harness.css` + `scripts/draft.js`) — the shipping app has one responsive draft-room route, not two.

## Surfaces

| Surface | Production files |
| --- | --- |
| `draft-room` | `DraftRoom.html` (desktop) · `DraftRoomMobile.html` (375px) · `DraftRoom.states.html` (non-populated states) · `components/{PlayerTable,DraftGrid,DepthChart}.html` (the three non-default views) |
| `draft-room-mobile` | none yet — options only; the shipping mobile board is `DraftRoomMobile.html` |
