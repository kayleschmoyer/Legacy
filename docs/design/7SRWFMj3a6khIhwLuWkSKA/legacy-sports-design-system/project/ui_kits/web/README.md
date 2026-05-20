# Web UI Kit — Legacy Sports

High-fidelity recreation of the `web/` app (React + Vite + Tamagui). Open `index.html` to run the interactive prototype.

## Components (JSX)

- `Nav.jsx` — sticky top nav with logo, product tabs, user chip
- `Hero.jsx` — landing hero with "Build Your Dynasty" headline + feature tiles
- `SportPicker.jsx` — baseball / football cards (football = Coming Soon)
- `LeagueCard.jsx` — dashboard league tile with inline scoreboard
- `GameCard.jsx` — live/final MLB game card (linescore, status, inning)
- `PlayerRow.jsx` — position-accent player row with era stats
- `StandingsTable.jsx` — 12-team W-L table with gold 1st-place badge
- `DraftBoard.jsx` — live draft pick grid
- `Chip.jsx`, `Button.jsx` — primitives

## Screens wired in `index.html`

1. **Landing (public)** — full marketing page
2. **Dashboard** — post-login home, "Your Leagues" grid
3. **Scoreboard** — today's MLB games
4. **League detail** — standings + live matchup

Click through via the nav.

## Fidelity notes

Visuals are pixel-targeted to the real app (tokens mirror `tamagui-config`). Interactions are click-through mocks — no real backend, no real websocket, no real auth. Player names are historical (Babe Ruth, Randy Johnson, etc.) to reflect the product's actual "play with legends" positioning.
