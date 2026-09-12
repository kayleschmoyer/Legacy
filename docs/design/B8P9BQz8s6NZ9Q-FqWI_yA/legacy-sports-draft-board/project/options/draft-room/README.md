# Options — draft-room board cell (desktop)

**Surface:** `draft-room` · **Status: decided — option C (value heat board)**

## The question
The production board cell leads with the position glyph and the pick number. All three options lead with the **player** instead, and each adds a different second layer of information. Which second layer earns the space?

| Variant | File | One-line description | Status |
| --- | --- | --- | --- |
| A | [a-player-first-card.html](./a-player-first-card.html) | Name as headline, position/club/career as a footnote, one signature stat, value chip. Cheapest change — same cell, better hierarchy. | rejected |
| B | [b-ranked-scoreboard.html](./b-ranked-scoreboard.html) | Rank plate anchors the cell so a column reads as haul quality; team headers gain roster-fill dots. | rejected |
| C | [c-value-heat-board.html](./c-value-heat-board.html) | Cells tinted by pick value (rank − pick); steals glow green, reaches red; footer totals net value per team. | chosen |

## Decision
**Option C — the value heat board — chosen by the product owner on 2026-09-12.** Options A and B are rejected.

The second layer that earns the space is *pick value*: every cell carries the signed difference between the overall pick number and the player's consensus rank, and the cell is tinted by it, so a column reads as a team's haul quality from across the room. A footer row totals net value per team. A and B both improve the cell's hierarchy, but neither turns the board into an argument about the draft the way C does.

Option C's content has been copied into [`../../components/DraftGrid.html`](../../components/DraftGrid.html), `c-value-heat-board.html` is marked `status="chosen"`, and A and B are marked `status="rejected"`.

**Correction carried into the implementation:** the original option C legend read "steal (fell 8+ slots)" / "reach (8+ early)", but the prototype's own tint thresholds in [`../../scripts/options-board.js`](../../scripts/options-board.js) are **6** and **14**, in both directions. The legend was wrong, not the code. Both the option file and `components/DraftGrid.html` now describe the real bands: 6–13 slots tints lightly, 14 or more tints strongly, and anything within 5 reads as on consensus.

When a winner is picked: copy its content into `components/DraftGrid.html`, set the winner `status="chosen"` and the others `status="rejected"`, and record the decision here.
