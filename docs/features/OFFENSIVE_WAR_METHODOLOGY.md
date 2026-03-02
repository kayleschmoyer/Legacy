# Offensive WAR (lWAR) Methodology

Our offensive WAR calculation closely follows
[Baseball Reference's oWAR methodology](https://www.baseball-reference.com/about/war_explained_position.shtml),
with a few documented deviations where play-by-play data is unavailable.

## Formula

```
lWAR = (wRAA + ParkAdj + LeagueAdj + wSB + PosAdj + Rrep) / RPW
```

Each component is computed **per player per season**, then summed across the
career and rounded to one decimal place.

---

## Components

### wRAA — Weighted Runs Above Average

```
wRAA = ((wOBA − lgwOBA) / wOBAScale) × PA
```

- `wOBA` is the player's weighted on-base average for the season
- Weights (`w_bb`, `w_hbp`, `w_1b`, `w_2b`, `w_3b`, `w_hr`) come from the
  `woba_season_weights` table (155 seasons, 1871–2025, sourced from FanGraphs)
- Intentional walks are excluded from the denominator:
  `PA − IBB`

### Park Adjustment

```
ParkAdj = (1 − BPF / 100) / 2 × PA × lgR/PA
```

- `BPF` is Baseball Reference's batting park factor, loaded into the
  `park_factors` table (2,934 team-season rows scraped from BR)
- For multi-team seasons, BPF is PA-weighted across teams

### League Adjustment

```
LeagueAdj = (mlbR/PA − lgR/PA) × PA
```

- Equalizes AL vs NL run environments so cross-league comparisons are fair
- Computed from `season_batting` aggregates

### wSB — Weighted Stolen Base Runs (League-Relative)

```
wSB = SB × runSB + CS × runCS − lgwSB × (1B + BB + HBP − IBB)
```

Where:

```
lgwSB = (lgSB × runSB + lgCS × runCS) / (lg1B + lgBB + lgHBP − lgIBB)
```

- `runSB` and `runCS` come from `woba_season_weights`
- League averages are computed per season per league (AL/NL)
- This is the BR formula — it measures stolen base value relative to the league
  baseline, not absolute

### Positional Adjustment

```
PosAdj = Σ (pos_value × COALESCE(inn_def, g × 9) / 1350)
```

- Year-specific positional values from the `positional_adjustments` table
  (155 seasons, 1871–2025, sourced from BR)
- Prorated by **defensive innings** (`inn_def / 1350`, where 1350 = 150 games ×
  9 innings), matching BR's approach
- Falls back to `g × 9 / 1350` (equivalent to `g / 150`) when `inn_def` is NULL
  (individual OF positions pre-1948)
- Each position has a distinct value (C, 1B, 2B, 3B, SS, LF, CF, RF, DH)
- When individual LF/CF/RF rows exist, the summary "OF" row is excluded to
  prevent double-counting
- When only the "OF" summary row exists (pre-1948 for some players), the LF
  positional value is used as proxy

### Replacement Level (Rrep)

```
Rrep = 20.5 × PA / 600
```

- Fixed at 20.5 runs per 600 PA, the BR standard
- BR may vary this slightly by league/season; we use the constant

### Runs Per Win (RPW)

Season-specific RPW from the `woba_season_weights` table. Converts the sum of
run-value components into wins.

---

## Data Sources

| Table | Rows | Source | Loaded By |
|---|---|---|---|
| `woba_season_weights` | 155 | FanGraphs (1871–2025) | `load-woba-weights` CLI command |
| `park_factors` | 2,934 | Baseball Reference BPF | `load-br-park-factors` CLI command |
| `positional_adjustments` | 155 | Baseball Reference | `load-positional-adjustments` CLI command |

---

## Known Deviations from Baseball Reference

| Component | BR Approach | Our Approach | Impact |
|---|---|---|---|
| **Rdp** (double play runs) | Play-by-play DP opportunity data | Omitted | ~0–2 career WAR for slow power hitters |
| **Rbaser** (baserunning beyond SB) | Play-by-play: advancing on hits, outs on bases | Omitted | ~±1–3 career WAR |
| **Rrep granularity** | Varies slightly by league/season | Fixed 20.5 per 600 PA | Minor |
| **wOBA weights source** | BR-computed | FanGraphs-sourced | < 0.001 per weight |
| **OF fallback** | Distinct LF/CF/RF for all eras | Uses LF value when only "OF" summary exists | Slightly penalizes CF-primary players in early eras |
| **Multi-team park factor** | Exact PA splits per park | PA-weighted team BPF | Small; only differs for mid-season trades |

### Why These Deviations Exist

**Rdp and Rbaser** require play-by-play data that Baseball Reference computes
from Retrosheet event files. We only have box-score-level data. These are the
two largest sources of divergence from BR's numbers.

Each deviation is implemented as an isolated, atomic piece of the formula so it
can be replaced independently when better data becomes available.

---

## View Definition

The calculation lives in the `career_batting` PostgreSQL view, defined in
`lib/db-client/migrations/20260226_090000_innings_based_positional_adj.ts`.

### CTE Pipeline

```
league_rpa → combined_rpa → league_sb → team_season_batting → season_totals → season_war → career_batting
```

1. **league_rpa** — AL/NL runs per PA by season
2. **combined_rpa** — MLB-wide runs per PA by season
3. **league_sb** — League-average wSB rate (lgwSB) by season/league
4. **team_season_batting** — Player stats grouped by team/season (for park factor weighting)
5. **season_totals** — Player season totals with PA-weighted park factor and league adjustment
6. **season_war** — Per-season lWAR for each player
7. **career_batting** — Career aggregates with `offensive_war` column

---

## Migration History

| Migration | Description |
|---|---|
| `20260226_040000_woba_season_weights.ts` | Add `woba_season_weights` table, rewrite view with wRAA formula |
| `20260226_050000_league_adjusted_owar.ts` | Add league adjustment component |
| `20260226_060000_br_park_factors.ts` | Switch from FanGraphs to BR park factors |
| `20260226_070000_positional_adjustments.ts` | Add year-specific positional adjustments, /150 proration, 20.5 replacement |
| `20260226_080000_league_relative_wsb.ts` | Switch BsR from absolute to league-relative wSB |
| `20260226_090000_innings_based_positional_adj.ts` | Switch positional proration from games to innings |
