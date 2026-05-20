# Scoreboard Design

_Started 2026-04-27 21:53 UTC_

---

## User

Attached is the prompt. The referenced page is scoreboard.md

## Assistant

_[tool: read_file]_

_[tool: read_file]_

I'll explore the design system, especially the existing scoreboard mock, before designing.

_[tool: list_files]_

_[tool: list_files]_

There's an existing Scoreboard mock in the design system. Let me read it along with the supporting files.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Now I have a strong sense of the system. Let me also peek at the brand icons available and the Nav component briefly.

_[tool: list_files]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: snip]_

_[tool: copy_files]_

Now let me design the scoreboard. I'll build a single self-contained HTML file with all four states (loading/error/empty/populated) togglable, plus mobile + desktop side-by-side.

Design plan:

- **Editorial header**: Big Shoulders title with letter-spacing, eyebrow date, status counters (Live/Final/Upcoming) as scoreboard chrome — not generic chips
- **Game cards**: differentiated by state — Live cards get seam-red glow + animated pulse + inning indicator + outs diamond (3 base-shaped pips); Final cards muted with gold accent on winning team's score; Upcoming cards lighter, scheduled-time forward
- **Linescore**: expandable inning-by-inning grid with mono numerals
- **State switcher**: tab strip at top of the page
- **Mobile + Desktop**: toggle between 375px frame and 1280px view

Let me write the file.

_[tool: write_file]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Built `scratch/mockups/scoreboard.html` — a single self-contained file with the design system's Big Shoulders / Literata fonts and night-stadium palette wired in.

**What's in it:**

- **State switcher** at the top — Populated / Loading / Error / Empty Schedule / No Data
- **Viewport toggle** — Mobile (375px) and Desktop (1280px) side-by-side, each toggleable
- Editorial header with marquee-scale title, italic formatted date, restyled date navigator (44×44 hit targets, native `<input type="date">`), live/upcoming/final counters with quiet semantic colors, auto-refresh indicator
- Three game sections (Live Now / Upcoming / Final) with pulsing lamp dots
- Game cards with status badge, **3-pip diamond outs indicator** (live only), team rows, large tabular scores (green leading / gray trailing / white tied / gold for Final winners), H/E footer line and **expandable inning-by-inning linescore** with horizontal scroll + thin scrollbar
- Skeletons that mirror real geometry (not generic gray bars)
- Error card with iconographic alert, neutral copy ("Unable to load…"), Retry primary
- Two distinct empty states with hand-drawn brand-icon-style SVG illustrations (empty diamond / clock-baseball)
- Motion intent annotated via HTML comments throughout; touch targets called out

Click any Live or Final card to expand its linescore.
