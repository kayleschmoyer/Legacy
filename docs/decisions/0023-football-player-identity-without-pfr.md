# 0023. Football player identity without PFR: pfr_id only from an authoritative crosswalk, `pfa_id` for the rest, stats join on `players.id`

Date: 2026-10-05

## Status

Accepted

## Context

Until now every football `players` row came from Pro Football Reference (PFR) discovery (`queue-players --sport football`), and every row carries a `pfr_id`. As of 2026-10-05 that holds for all 20,054 dev football players. LS-9968 found that discovery had silently dropped every Hall of Fame player: PFR's "+" HOF marker broke position parsing. The parser bug is fixed, but the rows were never backfilled, because PFR discovery cannot run again. PFR answers every scripted request with a Cloudflare 403, and its terms forbid building a database from it (LS-9908, [ADR 0022](0022-football-per-game-stats-source.md)).

Two non-PFR identity sources are available. Neither covers everyone.

- **nflverse `players.csv`** (CC-BY 4.0) is already the `pfr_id` → `gsis_id` crosswalk for the nflverse per-game corpus. It publishes PFR's own ids for 22,679 players. That includes pre-1999 players who were active in 1974 or later (nflverse floors `rookie_season` at 1974). Measured 2026-10-05, it contains authoritative `pfr_id`s for 167 missing pre-1999 players at tracked positions, which is effectively the whole missing HOF cohort (Montana `MontJo01`, Marino `MariDa00`, Elway `ElwaJo00`, Jerry Rice `RiceJe00`, ...). It also covers the 1999+ players PFR discovery missed.
- **The Pro Football Archives (PFA) player index** (`lib/pfa-client`, licensed per ADR 0022) reaches back to 1920 and covers players whose careers ended before 1974, such as Johnny Unitas. PFA ids (`unit00100`) share nothing with `pfr_id`.

`players_pfr_id_unique` is a partial unique index (`WHERE pfr_id IS NOT NULL`), so a NULL `pfr_id` is already schema-legal. `bref_id` is `NOT NULL UNIQUE`, and football rows use `bref_id = pfr_id`. LS-9948 asked for an explicit decision on how stats join for rows without a `pfr_id`.

## Decision

1. **`pfr_id` is populated only from an authoritative crosswalk**, which today means nflverse `players.csv`, verbatim. We will never synthesise one from PFR's `LastFiNN` pattern. The sequence number is assigned by PFR and is not derivable, so a guess can collide with a real player's id. That would silently attach someone else's data, which is worse than having no id.
2. **Players with no obtainable `pfr_id` get `pfr_id = NULL`** and a new **`players.pfa_id`** (partial unique, `WHERE pfa_id IS NOT NULL`). Their `bref_id` is `'pfa-' || pfa_id`, which satisfies `NOT NULL UNIQUE` and cannot collide with a PFR id (PFR ids start uppercase and contain no hyphen) or a BBRef id. LS-10588 implements this branch. If a `pfr_id` later becomes available from an authoritative source, it is set on the existing row and the row is not re-created.
3. **Season and career stats join on `players.id`, never on `pfr_id`.** This is already how every `football_season_*` / `career_football_*` table and `football_player_scoring_cache` is keyed, so a NULL-`pfr_id` player needs no schema change in the stats tables. The LS-10586 derive command builds those rows from per-game data addressed by the corpus key below.
4. **The per-game S3 corpus key is `pfr_id` when present, else `pfa-<pfa_id>`**: `pfa/v1/<key>/<season>.json.gz`, with nflverse keys unchanged. The ingest resolves the key at write time and the stats-lambda read path resolves the same key from the `players` row (ADR 0022's "crosswalk at ingest, never at read" still holds). Because the two namespaces are disjoint, one prefix serves both.
5. **New football identities are insert-only.** Seeding never updates or deletes a row PFR discovery created (`ON CONFLICT DO NOTHING`).

## Consequences

### Easier

- The missing HOF cohort can be restored now, from data we are licensed to use, with real PFR ids. That means existing `pfr_id`-keyed code, including the nflverse corpus already in S3 and `check-football-hof-coverage`, works for those players unchanged.
- Players that no source maps to PFR are representable without inventing identifiers.

### Harder

- A player can now exist without a `pfr_id`. Code that assumed one is always present has to handle NULL: `loadFootballCareerStats` throws on a missing `pfr_id`, and that is correct for its PFR-only path. Readers should use the corpus key (decision 4) instead of `pfr_id` directly.
- Two identity sources can describe the same human (a PFA-only row that later gains an nflverse id). Rule 2's "set it on the existing row" requires the seed commands to check `pfa_id` before inserting.

### Now constrained

- Any future football identity source must supply its own authoritative id mapping or go into its own nullable, partially-unique column. It must not write guessed values into `pfr_id`.
