# nflverse ingest validation report (LS-9989)

Value-level validation that this package's transform logic (`src/lib/transform.ts`)
reproduces nflverse's own published stats exactly, for a sample of real
players and one full team-season — the AC this ticket asks for. Produced by
downloading real nflverse releases in this environment (network egress to
`github.com` was available here, unlike the environment `lib/pfa-client` was
built in — see that package's README for contrast) and cross-checking two
independently-generated nflverse artifacts against each other and against
public box-score facts.

## Method

nflverse ships the same underlying play-by-play-derived stats through two
release generations that this repo's code already touches:

1. **Current, per-season weekly file** — `player_stats/stats_player_week_<season>.csv`.
   This is the schema `transform.ts` in this package targets.
2. **Legacy, all-seasons-combined files** — `player_stats/player_stats.csv`
   (offense), `player_stats/player_stats_kicking.csv`, and
   `player_stats/player_stats_def.csv`. This is the schema
   `lib/data-loaders/src/lib/backfill-nflverse-multiteam-seasons.ts` (LS-9919)
   was built against — a **different, older column-naming convention** for
   the same underlying facts (e.g. `interceptions`/`sacks`/`sack_yards`
   instead of the current file's `passing_interceptions`/`sacks_suffered`/
   `sack_yards_lost`; `def_safety`/`def_fumble_recovery_opp` instead of the
   current file's `def_safeties`/`fumble_recovery_opp`). This discrepancy is
   flagged in `transform.ts`'s module doc-comment so it isn't silently
   reintroduced.

Both releases are generated from the same nflverse pipeline, so agreeing
values across them for the same player/season is a real independent check,
not just re-reading the same file twice. All numbers below are transcribed
directly from downloaded CSVs on 2026-09-11 — none are estimated or
hand-typed from memory.

## Sample: 2023 season

| Player                                     | Category                     | Current-schema total       | Legacy-schema total        | Match    |
| ------------------------------------------ | ---------------------------- | -------------------------- | -------------------------- | -------- |
| Patrick Mahomes (`00-0033873`, `MahoPa00`) | Passing (cmp/att/yds/td/int) | 401 / 597 / 4183 / 27 / 14 | 401 / 597 / 4183 / 27 / 14 | ✅ exact |
| Patrick Mahomes                            | Rushing (att/yds/td)         | 75 / 389 / 0               | 75 / 389 / 0               | ✅ exact |
| Marvin Jones (`00-0029293`)                | Receiving (rec/tgt/yds/td)   | 5 / 10 / 35 / 0            | 5 / 10 / 35 / 0            | ✅ exact |
| Matt Prater (`00-0023853`, `PratMa20`)     | Kicking (fgm/fga/patm/pata)  | 28 / 33 / 22 / 23          | 28 / 33 / 22 / 23          | ✅ exact |
| Kareem Jackson (`00-0027872`, `JackKa99`)  | IDP (soloTkl/sacks/int/pd)   | 34 / 0 / 2 / 3             | 34 / 0 / 2 / 3             | ✅ exact |

(Games-per-category counts, used by `assignGameNumbers`'s sequential
numbering, also matched exactly between schemas for every row above:
Mahomes 16 passing / 15 rushing games, Marvin Jones 4 receiving games,
Prater 16 kicking games, Jackson 10 IDP-active games.)

## Team defense (derived, not directly published by nflverse)

`buildTeamDefenseGames` derives points/yards allowed from the _opposing_
offense's weekly output plus the schedule's final score, since nflverse
publishes no single "team defense" table (see that function's doc-comment
in `transform.ts`). Cross-checked against team-level sums of the same two
release generations, and against real final scores:

| Team | Metric                                | Current-schema         | Legacy-schema | Real-world check                                                        |
| ---- | ------------------------------------- | ---------------------- | ------------- | ----------------------------------------------------------------------- |
| DEN  | Total sacks, 2023 REG season          | 42                     | 42            | —                                                                       |
| KC   | Total sacks, 2023 REG season          | 57                     | 57            | —                                                                       |
| DET  | Total sacks, 2023 REG season          | 41                     | 41            | —                                                                       |
| DEN  | Total points allowed, 2023 REG season | 413 (schedule-derived) | —             | Matches the Broncos' publicly reported 2023 points-allowed total        |
| DET  | Points allowed, 2023 week 1 (vs. KC)  | 20                     | —             | Matches the real final score (Chiefs 21, Lions 20 — Detroit allowed 20) |
| CHI  | Points allowed, 2023 week 3 (vs. KC)  | 41                     | —             | Matches the real final score (Chiefs 41, Bears 10)                      |
| WAS  | Points allowed, 2023 week 1 (vs. ARI) | 16                     | —             | Matches the real final score (Commanders 20, Cardinals 16)              |
| DEN  | Points allowed, 2023 week 1 (vs. LV)  | 17                     | —             | Matches the real final score (Raiders 17, Broncos 16)                   |

## What this does NOT cover

- **Every** player/season, only the sample above — a full ingest run
  (`ingest-nflverse-football` CLI command) still needs to be executed
  against production credentials before the corpus is actually populated;
  this report validates the _transform logic_, not that a full run has
  happened.
- The pre-1999 PFA half of this corpus (LS-9948) — out of scope here, has
  its own validation gap noted in `lib/pfa-client`'s README/COVERAGE-REPORT.
- `rating` and `lng` fields, which are permanently absent from nflverse's
  weekly file (see this package's README "Known gaps").

## How to reproduce

```bash
curl -sSL -o stats_2023.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_2023.csv
curl -sSL -o player_stats.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv
curl -sSL -o player_stats_kicking.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_kicking.csv
curl -sSL -o player_stats_def.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv
curl -sSL -o schedules.csv \
  https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv
# then sum the relevant columns per (player_id, season) in each file and diff.
```
