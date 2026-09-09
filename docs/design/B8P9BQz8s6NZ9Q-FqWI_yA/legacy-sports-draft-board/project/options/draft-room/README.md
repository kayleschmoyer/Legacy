# Options — draft-room board cell (desktop)

**Surface:** `draft-room` · **Status: decision pending**

## The question
The production board cell leads with the position glyph and the pick number. All three options lead with the **player** instead, and each adds a different second layer of information. Which second layer earns the space?

| Variant | File | One-line description | Status |
| --- | --- | --- | --- |
| A | [a-player-first-card.html](./a-player-first-card.html) | Name as headline, position/club/career as a footnote, one signature stat, value chip. Cheapest change — same cell, better hierarchy. | proposed |
| B | [b-ranked-scoreboard.html](./b-ranked-scoreboard.html) | Rank plate anchors the cell so a column reads as haul quality; team headers gain roster-fill dots. | proposed |
| C | [c-value-heat-board.html](./c-value-heat-board.html) | Cells tinted by pick value (rank − pick); steals glow green, reaches red; footer totals net value per team. | proposed |

## Decision
Not yet made. Nothing here is implemented — `/implement-design` builds [`../../DraftRoom.html`](../../DraftRoom.html) and [`../../components/DraftGrid.html`](../../components/DraftGrid.html) as shown.

When a winner is picked: copy its content into `components/DraftGrid.html`, set the winner `status="chosen"` and the others `status="rejected"`, and record the decision here.
