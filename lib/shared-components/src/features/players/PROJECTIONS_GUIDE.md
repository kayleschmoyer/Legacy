# Player Projection Utilities

The projection utilities combine historical statistics with configurable scoring profiles to surface projected fantasy points for each player. They are designed to be shared between the mobile and web clients so both surfaces use the same projection logic.

## Key Pieces

| Export                    | Description                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `usePlayerProjections`    | React hook that builds a `Map<playerId, points>` of projected fantasy points per game. |
| `formatProjection`        | Utility for displaying projection values with adaptive precision.                      |
| `PlayerCareerStats`       | Normalized career data (batting, fielding, pitching) used by the projection algorithm. |
| `BaseballScoringSettings` | Configuration for batting/fielding/pitching multipliers.                               |

## Computing Projections

1. Fetch or construct `PlayerCareerStats` for each player. The helper expects numeric values and a `g` (games) field for each stat group.
2. Obtain scoring multipliers from league configuration. If no overrides are provided, defaults from `@legacy-sports/scoring` are used.
3. Call `usePlayerProjections(players, careerStats, scoringOverrides)`:

```ts
const { projections, loading, error } = usePlayerProjections(
  players,
  careerStats,
  scoringSettings,
  isLoading,
  upstreamError,
);
```

The hook safely handles partially loaded data and returns an empty map until all dependencies are ready.

## Extending the Algorithm

- **Additional Statistics**: Add new keys to `PlayerCareerStats` and reference the same keys in the scoring settings. The hook automatically multiplies any numeric value by its configured multiplier.
- **Alternate Weighting**: For non per-game projections, replace `determineGamesPlayed` inside `usePlayerProjections` with a different baseline (for example, plate appearances).
- **UI Integration**: Pass the resulting `Map` to components such as `PlayersTable` via the `projectedPoints` prop, or display inline with `formatProjection`.

Keeping projection logic isolated in shared-components ensures both apps stay in sync with the latest scoring configuration.
