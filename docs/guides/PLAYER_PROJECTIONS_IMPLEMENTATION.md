# Player Projections Implementation Guide

This guide documents the shared projection workflow used by the mobile and web clients. The tooling lives in `lib/shared-components` and pairs league scoring profiles with historical career averages to produce projected fantasy points per game.

## Data Flow Overview

1. **Career Statistics** – Fetched through GraphQL resolvers (`playerCareerBatting`, `playerCareerFielding`, `playerCareerPitching`) and normalized into the `PlayerCareerStats` structure.
2. **Scoring Settings** – Loaded from the league scoring profile or default multipliers provided by `@legacy-sports/scoring`.
3. **Projection Hook** – `usePlayerProjections` multiplies each stat bucket by its configured multiplier, sums the totals, and normalizes by games played to calculate per-game projections.
4. **UI Components** – Components such as `PlayersTable` consume the resulting projection map via the `projectedPoints` prop and render formatted values with `formatProjection`.

## Example Usage

```tsx
const {
  settings: scoringSettings,
  loading: scoringLoading,
  error: scoringError,
} = useLeagueScoringSettings(leagueId);

const {
  records: careerStats,
  loading: statsLoading,
  error: statsError,
} = useCareerAverageStats(playerIds);

const { projections } = usePlayerProjections(
  players,
  careerStats,
  scoringSettings,
  scoringLoading || statsLoading,
  scoringError ?? statsError,
);

return <PlayersTable showProjections projectedPoints={projections} />;
```

## Key Concepts

- **Safety First**: All helpers guard against partial data. If scoring settings or career stats are still loading, the projection map stays empty.
- **Configurable**: Scoring multipliers can be overridden per league. The hook always merges overrides with the default multipliers to ensure every stat has a value.
- **Per-Game Normalization**: By default, projections are divided by the greater of batting, fielding, or pitching games to provide a per-game fantasy estimate.

Keep this guide in sync whenever the projection algorithm or scoring data structures change. This ensures both AI agents and maintainers understand how projections are calculated end-to-end.
