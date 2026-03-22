# Players Feature Shared Components

This package provides reusable UI primitives and hooks for working with player data across web and mobile surfaces. Key exports include:

- `PlayersTable`, `PlayersGrid`, and `PlayersScreen` – high-level React components for browsing and selecting players.
- `usePlayerProjections` – React hook that converts career statistics and scoring multipliers into projected fantasy points per game.
- `formatProjection` – utility helper for displaying projection values in a consistent format.
- `CareerStatsService` – server-side helpers for fetching and transforming career statistics.

## Projection Helpers

The projection helpers pair career averages with scoring profiles to calculate estimated fantasy production. They accept any `PlayerFragment` collection and a `Map` of `PlayerCareerStats`. All multipliers default to the baseline values provided by `@legacy-sports/scoring`, but consumers can supply overrides for custom leagues.

```ts
const { projections } = usePlayerProjections(
  players,
  careerStats,
  scoringOverrides,
);
const formatted = formatProjection(projections.get(playerId));
```

See `PROJECTIONS_GUIDE.md` for implementation details and extension points.
