# Options — draft board at 375 px

**Surface:** `draft-room-mobile` · **Status: decided — option E (round tiles)**

## The question
The desktop board's 12-column snake cannot survive a 375 px screen intact. All five options name the player rather than the position — they differ in **which axis survives the narrow screen**: time, team, the board itself, or the round.

| Variant | File | Axis | One-line description | Status |
| --- | --- | --- | --- | --- |
| A | [a-pick-feed.html](./a-pick-feed.html) | Time | Newest round first, one row per pick; name as headline, stat right, value chip. | rejected |
| B | [b-team-pager.html](./b-team-pager.html) | Team | Tap through twelve rosters slot by slot, open slots called out, net-value line. | rejected |
| C | [c-pocket-grid.html](./c-pocket-grid.html) | The board | Real columns and rounds at 104 px wide, pinned team header, drag-scroll. | rejected |
| D | [d-round-runner.html](./d-round-runner.html) | Round | Round tabs, then the round drawn as the snake it is, with a position-mix bar. | rejected |
| E | [e-round-tiles.html](./e-round-tiles.html) | Round | Twelve teams 3×4 — the whole round with no scrolling, plus a slide-up pick sheet. | chosen |

## Decision
**Option E — round tiles — chosen.** Options A–D are rejected. No separate product-owner decision date was recorded: option E was adopted upstream in Claude Design directly into [`../../DraftRoomMobile.html`](../../DraftRoomMobile.html), and that page is what shipped.

The axis that survives the narrow screen is the *round*: round tabs over a 3-across grid that shows every team's pick for the round with no scrolling, a pinned squad bar for your own roster, and a slide-up sheet of available players. `DraftRoomMobile.html` renders exactly that (`mob-round`, `mob-squad`, `mob-picksheet` / `mob-sheet`).

Implemented in `lib/shared-components/src/features/elite-draft/` by LS-10000 (round view, `DraftRoundBoard`), LS-10001 (squad strip) and LS-10002 (slide-up pick sheet), under epic LS-9999. `e-round-tiles.html` is marked `status="chosen"`; A–D are marked `status="rejected"`.

When a winner is picked: copy its content into `DraftRoomMobile.html`, set the winner `status="chosen"` and the others `status="rejected"`, and record the decision here.
