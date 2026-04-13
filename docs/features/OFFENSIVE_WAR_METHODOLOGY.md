# Offensive WAR (lWAR) Methodology

Our offensive WAR calculation closely follows
[Baseball Reference's oWAR methodology](https://www.baseball-reference.com/about/war_explained_position.shtml),
with a few documented deviations where play-by-play data is unavailable.

## Data Source

The `offensive_war` column uses **Baseball Reference's own oWAR values**,
imported per-season via the `bwar` column on `season_batting`.

```
career oWAR = ROUND(SUM(season_batting.bwar), 1)   -- where PA ≥ 10
```

The `bwar` field is loaded from BR's `B_WAR` / `WAR_BAT` export columns by
`bref-client` during the career stats import pipeline. This ensures displayed
values match Baseball Reference exactly.

### Import Pipeline

1. `bref-client` scrapes per-season batting data from Baseball Reference
2. The `B_WAR` column maps to `season_batting.bwar` (double precision)
3. `career_batting` (materialized view) sums `bwar` across AL/NL seasons
4. `refreshCareerStats()` re-materializes after each SQS batch import

---

## View Definition

The `career_batting` materialized view is defined in
`lib/db-client/migrations/20260412_120000_use_imported_bwar_for_career_owar.ts`.

It is a simple aggregation of `season_batting` filtered to AL/NL leagues,
grouped by `player_id`, with `offensive_war = ROUND(SUM(bwar), 1)` when the
player has at least 10 career plate appearances.

---

## Migration History

| Migration                                              | Description                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `20260226_040000_woba_season_weights.ts`               | Add `woba_season_weights` table, rewrite view with wRAA formula            |
| `20260226_050000_league_adjusted_owar.ts`              | Add league adjustment component                                            |
| `20260226_060000_br_park_factors.ts`                   | Switch from FanGraphs to BR park factors                                   |
| `20260226_070000_positional_adjustments.ts`            | Add year-specific positional adjustments, /150 proration, 20.5 replacement |
| `20260226_080000_league_relative_wsb.ts`               | Switch BsR from absolute to league-relative wSB                            |
| `20260226_090000_innings_based_positional_adj.ts`      | Switch positional proration from games to innings                          |
| `20260303_130000_materialize_career_stat_views.ts`     | Materialize career views for performance                                   |
| `20260412_120000_use_imported_bwar_for_career_owar.ts` | Replace formula with imported BR bwar values (LS-3136)                     |
