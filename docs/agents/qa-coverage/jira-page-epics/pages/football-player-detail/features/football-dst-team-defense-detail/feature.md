# Feature: Football DST Team-Defense Detail

**Jira:** LS-7638
**Page:** `football-player-detail` (Epic LS-5270)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

A team defense ("DST") is modelled as a `FootballPlayer` with `isDst === true`.
On the Football Player Detail page this triggers a distinct render path that is
separate from offensive skill positions (QB / RB / WR / TE / K) and from
Individual Defensive Players (DL / LB / DB → IDP). The DST path differs from a
regular player in two visible ways:

1. **Header position chip rebrands to `DST`.** For a DST entity the position
   badge renders the literal `DST` instead of the raw `player.position` value,
   so the page reads as a team-defense unit rather than a single athlete.

2. **A DST-specific career stats card (`DstStatsTable`)** replaces the
   offensive / IDP stat groups. It surfaces team-defense counting stats plus
   derived per-game rates, including the `Pts Allowed/G` metric.

This Feature Story was created from code-audit GAP-002 (LS-7638): the DST render
path, its eight-column stat card, and the `Pts Allowed/G` value were live in
code and unit-tested (LS-6247) but had never been enumerated in the QA
inventory under `football-stats-breakdowns` or `football-player-header`.

## Source

Extracted from code audit (Feature Discovery From Code lens), GAP-002 under the
Football Player Detail page epic (LS-5270). Recommendation: create Feature Story
`football-dst-team-defense-detail`.

## Implementation

**Component:** `lib/shared-components/src/features/football/FootballPlayerDetail.tsx`

The DST entity is identified by `player.isDst`. The stats card selection is a
three-way branch evaluated after a `careerStats == null` guard:

| Condition                                | Card rendered            |
| ---------------------------------------- | ------------------------ |
| `isDst === true`                         | `DstStatsTable`          |
| `position` in `{ DL, LB, DB }` (`isIdp`) | `IdpStatsTable`          |
| otherwise                                | `OffenseStatsTable(pos)` |

### Header — DST position chip

In the player header, the position badge text is
`isDst ? 'DST' : (player.position ?? '?')`. The team-color swatch (left of the
name) is shared with all positions: it renders `player.nflTeam ?? 'FA'` at a
uniform `fontSize={13}`, coloured from the `NFL_TEAMS` lookup
(`primaryColor` background, `secondaryColor` text/border), with a muted
free-agent fallback when `nflTeam` is null. There is **no** DST-specific swatch
font size in the current code — the historical GAP-002 note of a "size 9 vs 13"
swatch font does not reflect the shipped component; the swatch font is `13` for
DST and non-DST alike. The only DST-specific header difference is the chip
label.

### `DstStatsTable` — career stat columns

Rendered inside a `StatGroup` titled **"Career DST Stats"**, reading from
`careerStats.defense`. Eight `StatCell` columns, in order:

| Column          | Source                              | Notes                                                |
| --------------- | ----------------------------------- | ---------------------------------------------------- |
| `Sacks`         | `defense.sacks`                     | one-decimal float (`fmtFloat`)                       |
| `Sacks/G`       | `perGame(defense.sacks, defense.g)` | derived; one decimal                                 |
| `INT`           | `defense.int`                       | integer (`fmt`)                                      |
| `INT/G`         | `perGame(defense.int, defense.g)`   | derived; two decimals                                |
| `Def TD`        | `defense.defTd`                     | integer                                              |
| `Fum Rec`       | `defense.fumRec`                    | integer                                              |
| `Pts Allowed/G` | `defense.ptsAllowedPerG`            | backend-provided per-game field (not client-derived) |
| `Yds Allowed/G` | `defense.ydsAllowedPerG`            | backend-provided per-game field                      |

### `Pts Allowed/G` calculation

`Pts Allowed/G` is **not** computed on the client — it is read directly from the
`defense.ptsAllowedPerG` field on `FootballPlayer.careerStats` and formatted via
`fmtFloat` (one decimal, em dash when null). This contrasts with `Sacks/G` and
`INT/G`, which the component derives at render time from career totals via the
`perGame(total, games)` helper. `perGame` returns `null` (rendered as an em
dash) when `games` is null/zero, so the two derived rates degrade gracefully
when career games-played is absent while the backend-supplied `Pts Allowed/G`
still renders.

### DST season breakdown

When `seasonStats.defense` rows are present, `SeasonBreakdowns` renders a
"Defense — Season Breakdown" table (`YEAR, TEAM, G, SACKS, INT, FUM, DEF TD,
PTS`) below the career card. This is shared with IDP/defensive players and is
not DST-exclusive, but it is the season-level counterpart to the DST career
card.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/football/FootballPlayerDetail.spec.tsx`
(`describe('FootballPlayerDetail')`, DST fixture `DST_PLAYER` with
`isDst: true`, `position: 'DST'`):

- `renders DST stats for a defense` — asserts "Career DST Stats" card and
  "Pts Allowed/G" column render for an `isDst` player.
- `renders per-game DST rate metrics and additional career fields (LS-6247)` —
  asserts `Sacks/G` (1.3 = 45.5 / 34), `INT/G` (0.53 = 18 / 34), `Def TD`,
  `Fum Rec`, and `Yds Allowed/G` columns.
- `falls back to em dash for per-game rates when career games is absent
(LS-6247)` — `Sacks/G` and `INT/G` render `—` when `defense.g` is undefined.
- `renders a DST season breakdown table with recent-season defense numbers
(LS-6247)` — asserts the "Defense — Season Breakdown" table and its
  `DEF TD` / `PTS` columns.

### E2E tests

No dedicated DST E2E scenario exists yet on the Football Player Detail page
(the existing `apps/web-e2e/src/tests/player-detail-*.spec.ts` specs cover
offensive players). A hermetic DST detail spec — header chip reads `DST`,
"Career DST Stats" card visible, `Pts Allowed/G` populated — is an open
coverage gap worth tracking under this page epic.

## Related

- **Epic:** LS-5270 — QA — Page: Football Player Detail
- **Implementation ref:** `lib/shared-components/src/features/football/FootballPlayerDetail.tsx`
  (`DstStatsTable`, `perGame`, header position chip)
- **Web page entry:** `apps/web/src/pages/football/FootballPlayerDetailPage.tsx`
- **Per-game DST rates / additional career fields:** LS-6247
