# Multi-sport scoreboard

_Started 2026-05-20 01:18 UTC_

---

## User

update this design to account for adding football as a second sport to the application. WE should be able to see both sports on the scoreboard page, or switch a filter to show only one or the other

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: copy_files]_

Good — I have all the design system context. Let me plan and build this.

**Approach:**

1. **Sport filter** — segmented pill (All Sports / MLB / NFL) placed in the header
2. **Title adapts** to filter (Scoreboard / MLB Scoreboard / NFL Scoreboard)
3. **Per-card sport identity** — sport name appended to status badge; team logo gradient switches navy→turf-green for NFL
4. **NFL card semantics** — Q3 8:42 (vs Top 7), down & distance + possession dot (vs out pips), TOT YDS / TOs (vs H/E), 4-quarter linescore
5. **Date moves to Sun Oct 19, 2025** — Sunday slate of NFL + MLB postseason makes both sports plausible in one day

Let me write it.

_[tool: write_file]_

Got it. Let me rebuild with:

- Sport filter (All / MLB / NFL)
- NFL game cards
- Viewport options: Mobile 375 / Tablet 768 / Laptop 1024 / Desktop 1280 / Wide 1440 (no "both")

_[tool: done]_

_[tool: fork_verifier_agent]_

Updated the scoreboard with multi-sport support:

**Sport filter** — segmented pill in the header (All · MLB · NFL) with sport glyphs and live counts. When NFL is exclusive, the active pill switches to turf-green to reinforce sport identity.

**NFL game cards** — sport-aware variant of the same card chassis:

- Status reads `Q3 8:42` instead of `Top 7`
- Down & distance + yard line (`2nd & 7 · KC 38`) replaces the out pips
- Aged-gold possession bar on the team with the ball
- Footer shows `YDS / TO` instead of `H / E`
- Linescore expands to 4 quarters (+ OT) with totals
- Team logo tile uses a turf-green gradient

**When filter = All** — sections still group by status (Live / Upcoming / Final); each card carries an `MLB`/`NFL` sport tag in its status line, and each section header shows a small `3 MLB · 2 NFL` breakdown.

**Date** moved to Sunday Oct 19, 2025 — credible Sunday where both NFL Week 7 and MLB postseason are simultaneously active.

**Viewports** — toolbar now lists Mobile · 375 / Tablet · 768 / Laptop · 1024 / Desktop · 1280 / Wide · 1440. Replaced the dual-frame stage with a single resizable frame; the scoreboard inside adapts via CSS container queries (not viewport media queries), so picking "Mobile" on a wide monitor genuinely renders the mobile layout.
