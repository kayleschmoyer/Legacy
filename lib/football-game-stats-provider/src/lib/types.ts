import type {
  GameFootballDefense,
  GameFootballDefenseIdp,
  GameFootballKicking,
  GameFootballPassing,
  GameFootballReceiving,
  GameFootballRushing,
} from '@legacy-sports/pfr-client';

/**
 * Current on-disk (in-S3) payload version. Bump alongside the `v1` path
 * segment in {@link buildPlayerObjectKey} / {@link buildTeamDefenseObjectKey}
 * whenever the stored shape changes so a re-ingest can be rolled out without
 * mutating existing objects in place. Matches the layout documented in
 * `terraform/main/football-corpus.tf`.
 */
export const NFLVERSE_PAYLOAD_VERSION = 1;

/**
 * Rows are stored WITHOUT `playerId`: the app's surrogate player id is a
 * property of this database, not of nflverse. The provider injects it at
 * read time from the `PfrPlayer` the caller already holds — mirrors
 * `StoredBatting`/`StoredPitching`/`StoredFielding` in
 * `@legacy-sports/game-stats-provider` (LS-9817).
 */
export type StoredGameFootballPassing = Omit<GameFootballPassing, 'playerId'>;
export type StoredGameFootballRushing = Omit<GameFootballRushing, 'playerId'>;
export type StoredGameFootballReceiving = Omit<
  GameFootballReceiving,
  'playerId'
>;
export type StoredGameFootballKicking = Omit<GameFootballKicking, 'playerId'>;
export type StoredGameFootballDefenseIdp = Omit<
  GameFootballDefenseIdp,
  'playerId'
>;
export type StoredGameFootballDefense = Omit<GameFootballDefense, 'playerId'>;

/**
 * One object per (pfrId, season) holding every offensive/kicking/IDP category
 * for that player — mirrors `RetrosheetSeasonPayload`'s "one object holds all
 * stat families" shape. Team defense (DST) is NOT included here: PFR's own
 * `TeamDefense.getGameLog` keys entirely off `nflTeam`, never off the DST
 * "player" row's `pfrId` (see `lib/pfr-client/src/lib/TeamDefense.ts`), so it
 * is staged separately in {@link NflverseTeamDefenseSeasonPayload}.
 */
export interface NflversePlayerSeasonPayload {
  v: number;
  pfrId: string;
  /** nflverse's own player id (`gsis_id`), kept for traceability. */
  gsisId: string;
  season: number;
  passing: StoredGameFootballPassing[];
  rushing: StoredGameFootballRushing[];
  receiving: StoredGameFootballReceiving[];
  kicking: StoredGameFootballKicking[];
  defenseIdp: StoredGameFootballDefenseIdp[];
}

/** One object per (nflTeam, season) holding that team's defensive game log. */
export interface NflverseTeamDefenseSeasonPayload {
  v: number;
  nflTeam: string;
  season: number;
  games: StoredGameFootballDefense[];
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed.length > 0 ? `${trimmed}/` : '';
}

/**
 * S3 object key for a player-season. Keyed by `pfrId` (this app's existing
 * football player identifier) rather than nflverse's `gsis_id`, so the
 * pfr_id -> gsis_id crosswalk is applied once at ingest instead of on every
 * read — callers already carry `player.pfrId`.
 */
export function buildPlayerObjectKey(
  prefix: string,
  pfrId: string,
  season: number,
): string {
  return `${normalizePrefix(prefix)}nflverse/v${NFLVERSE_PAYLOAD_VERSION}/${pfrId}/${season}.json.gz`;
}

/**
 * S3 object key for a team's defensive game log. Kept under the same
 * `nflverse/` prefix as player objects (same bucket, same IAM policy) but in
 * its own `team-defense/` sub-prefix since it is keyed by `nflTeam`, not by
 * any player's `pfrId`.
 */
export function buildTeamDefenseObjectKey(
  prefix: string,
  nflTeam: string,
  season: number,
): string {
  return `${normalizePrefix(prefix)}nflverse/v${NFLVERSE_PAYLOAD_VERSION}/team-defense/${nflTeam.toUpperCase()}/${season}.json.gz`;
}

/**
 * nflverse-data (github.com/nflverse/nflverse-data) is licensed CC-BY-4.0 and
 * requires visible attribution wherever this data — or a product built on
 * it — is distributed. See `terraform/main/football-corpus.tf` and
 * `docs/decisions/0022-football-per-game-stats-source.md`.
 */
export const NFLVERSE_ATTRIBUTION =
  'Football per-game stats for the 1999-2025 seasons are sourced from ' +
  'nflverse (https://github.com/nflverse/nflverse-data), licensed under ' +
  'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).';
