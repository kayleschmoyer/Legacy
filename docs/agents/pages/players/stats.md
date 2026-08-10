# Player Statistics Page — Reference

**Route**: `/players/stats` — **permanent redirect to `/players`, preserving the full query string** (LS-9076)  
**File**: `apps/web/src/pages/players/PlayersStatsRedirectPage.tsx`

---

`/players/stats` no longer renders content itself. `/players` absorbed this
page's full functionality (search, filters, view-mode tabs, stat columns,
column visibility, export, share, URL-persisted state, schema versioning) —
see [`index.md`](./index.md) for the complete reference, including the section
formats (Layout, View Modes, Columns, Filters & Controls, URL-Persisted State,
URL Schema Versioning, Player Detail Modal, Stats Format, States) still
extracted by the `docs/agents/qa-coverage/` feature docs under
`pages/player-stats/features/`.

The route stays registered — and public/unauthenticated-reachable — purely so
existing bookmarks, shared links, and indexed search results keep resolving:
`PlayersStatsRedirectPage` reads `location.search` and issues a client-side
`<Navigate to={`/players${location.search}`} replace />`, so
`/players/stats?view=hitters&minHomeRuns=20` lands on
`/players?view=hitters&minHomeRuns=20` with every param intact.
