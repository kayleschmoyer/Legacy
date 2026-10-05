import type {
  GameFootballKicking,
  GameFootballPassing,
  GameFootballReceiving,
  GameFootballRushing,
} from '@legacy-sports/pfr-client';

/**
 * Current on-disk (in-S3) payload version. Bump alongside the `v1` path
 * segment in {@link buildPfaObjectKey} whenever the stored shape changes so
 * a re-ingest can be rolled out without mutating existing objects in place.
 * Matches the layout documented in `terraform/main/football-corpus.tf`
 * (`pfa/v1/<pfrId>/<season>.json.gz`).
 */
export const PFA_PAYLOAD_VERSION = 1;

/**
 * Rows are stored WITHOUT `playerId`: the app's surrogate player id is a
 * property of this database, not of PFA. The provider injects it at read
 * time from the `Player` the caller already holds — mirrors
 * `StoredGameFootball*` in `@legacy-sports/football-game-stats-provider`
 * (LS-9989), which this itself mirrors from
 * `@legacy-sports/game-stats-provider` (LS-9817).
 *
 * Only passing/rushing/receiving/kicking are stored: `game_football_defense`
 * and `game_football_defense_idp` have no PFA source (individual tackles
 * were never an official NFL statistic pre-1999, sacks not official until
 * 1982 — a confirmed permanent gap, not a sourcing omission, LS-9948).
 * `game_football_punting` and returns categories PFA's box scores DO parse
 * (`BoxScoreParser`'s `punting`/`puntReturns`/`kickoffReturns`) have no
 * destination table in this schema at all, so they are not staged here
 * either.
 */
export type StoredGameFootballPassing = Omit<GameFootballPassing, 'playerId'>;
export type StoredGameFootballRushing = Omit<GameFootballRushing, 'playerId'>;
export type StoredGameFootballReceiving = Omit<
  GameFootballReceiving,
  'playerId'
>;
export type StoredGameFootballKicking = Omit<GameFootballKicking, 'playerId'>;

/**
 * One object per (corpus key, season) holding every PFA-sourced stat category
 * for that player-season — mirrors `NflversePlayerSeasonPayload`'s "one
 * object holds all stat families" shape (LS-9989).
 *
 * `pfrId` is `null` for a player with no obtainable PFR id (ADR 0023,
 * LS-10588); that object is keyed `pfa-<pfaId>` instead.
 */
export interface PfaPlayerSeasonPayload {
  v: number;
  pfrId: string | null;
  /** PFA's own player id, kept for traceability back to the source page. */
  pfaId: string;
  season: number;
  passing: StoredGameFootballPassing[];
  rushing: StoredGameFootballRushing[];
  receiving: StoredGameFootballReceiving[];
  kicking: StoredGameFootballKicking[];
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed.length > 0 ? `${trimmed}/` : '';
}

/**
 * S3 object key for a player-season. Keyed by the player's corpus key: the
 * `pfrId` (this app's existing football player identifier, shared with the
 * nflverse sibling ingest), or `pfa-<pfaId>` for a player with no PFR id
 * (ADR 0023). The PFA-id crosswalk is applied once at ingest instead of on
 * every read. See `terraform/main/football-corpus.tf`'s documented layout:
 * `pfa/v1/<pfrId>/<season>.json.gz`, alongside `nflverse/v1/<pfrId>/<season>.json.gz`.
 */
export function buildPfaObjectKey(
  prefix: string,
  corpusKey: string,
  season: number,
): string {
  return `${normalizePrefix(prefix)}pfa/v${PFA_PAYLOAD_VERSION}/${corpusKey}/${season}.json.gz`;
}

/**
 * Pro Football Archives content is licensed separately (not CC-BY like
 * nflverse) — see `terraform/main/football-corpus.tf`'s header comment and
 * LS-9948's "Licensing with Pro Football Archives is being handled
 * separately by the product owner". Surfaced here so callers can attribute
 * consistently if/when the negotiated agreement requires it, mirroring
 * `NFLVERSE_ATTRIBUTION`'s shape even though PFA's own terms govern content.
 */
export const PFA_ATTRIBUTION =
  'Football per-game stats for the 1960-1998 seasons are sourced from ' +
  'Pro Football Archives (https://www.profootballarchives.com), used under ' +
  "the negotiated agreement referenced in LS-9948's ticket history.";
