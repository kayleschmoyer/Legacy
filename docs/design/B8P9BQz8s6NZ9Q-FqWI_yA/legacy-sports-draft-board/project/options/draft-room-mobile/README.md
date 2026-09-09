# Options — draft board at 375 px

**Surface:** `draft-room-mobile` · **Status: decision pending**

## The question
The desktop board's 12-column snake cannot survive a 375 px screen intact. All five options name the player rather than the position — they differ in **which axis survives the narrow screen**: time, team, the board itself, or the round.

| Variant | File | Axis | One-line description | Status |
| --- | --- | --- | --- | --- |
| A | [a-pick-feed.html](./a-pick-feed.html) | Time | Newest round first, one row per pick; name as headline, stat right, value chip. | proposed |
| B | [b-team-pager.html](./b-team-pager.html) | Team | Tap through twelve rosters slot by slot, open slots called out, net-value line. | proposed |
| C | [c-pocket-grid.html](./c-pocket-grid.html) | The board | Real columns and rounds at 104 px wide, pinned team header, drag-scroll. | proposed |
| D | [d-round-runner.html](./d-round-runner.html) | Round | Round tabs, then the round drawn as the snake it is, with a position-mix bar. | proposed |
| E | [e-round-tiles.html](./e-round-tiles.html) | Round | Twelve teams 3×4 — the whole round with no scrolling, plus a slide-up pick sheet. | proposed |

## Decision
Not yet made. Nothing here is implemented — `/implement-design` builds [`../../DraftRoomMobile.html`](../../DraftRoomMobile.html) as shown.

When a winner is picked: copy its content into `DraftRoomMobile.html`, set the winner `status="chosen"` and the others `status="rejected"`, and record the decision here.
