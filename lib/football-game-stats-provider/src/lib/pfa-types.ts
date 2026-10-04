import type {
  StoredGameFootballKicking,
  StoredGameFootballPassing,
  StoredGameFootballReceiving,
  StoredGameFootballRushing,
} from './types';

/**
 * Pro Football Archives (PFA) half of the football corpus: 1960-1998, the
 * seasons nflverse cannot cover because NFL play-by-play does not exist
 * before 1999 (ADR 0022, LS-9948). Read path only — the ingest that writes
 * these objects is `apps/cli`'s `ingest-pfa-football` command (LS-9995), whose
 * `lib/pfa-client/src/lib/s3-payload.ts` defines the same shape on the write
 * side. Keep the two in lockstep; bump {@link PFA_PAYLOAD_VERSION} (and the
 * `v1` path segment) together on any shape change.
 */
export const PFA_PAYLOAD_VERSION = 1;

/** First and last season the PFA corpus covers (inclusive). */
export const PFA_FIRST_SEASON = 1960;
export const PFA_LAST_SEASON = 1998;

/** True when `season` falls inside the PFA corpus's 1960-1998 range. */
export function isPfaSeason(season: number): boolean {
  return (
    Number.isInteger(season) &&
    season >= PFA_FIRST_SEASON &&
    season <= PFA_LAST_SEASON
  );
}

/**
 * One object per (pfrId, season), mirroring `NflversePlayerSeasonPayload`
 * minus the families PFA has no source for:
 *
 * - No `defenseIdp`: individual tackles were never an official NFL statistic
 *   and sacks were not official until 1982, so there is no pre-1999 per-game
 *   IDP data from any source (a permanent product constraint, LS-9948).
 * - No team defense: not staged by the PFA ingest.
 * - `fumbles` on rushing/receiving rows is always `null`: PFA does not track
 *   fumbles in any era. `null` means "unknown", never "zero fumbles".
 *
 * `rating`/`sacked`/`sackYds`/`lng` are era-limited in PFA's box scores and
 * are `null` wherever the source table did not render them.
 */
export interface PfaPlayerSeasonPayload {
  v: number;
  pfrId: string;
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
 * S3 object key for a PFA player-season: `pfa/v1/<pfrId>/<season>.json.gz`,
 * the layout documented in `terraform/main/football-corpus.tf`. Keyed by
 * `pfrId` like the nflverse half, so the PFA-id crosswalk happens at ingest
 * and reads need no lookup.
 */
export function buildPfaObjectKey(
  prefix: string,
  pfrId: string,
  season: number,
): string {
  return `${normalizePrefix(prefix)}pfa/v${PFA_PAYLOAD_VERSION}/${pfrId}/${season}.json.gz`;
}

/**
 * Thrown when a PFA object exists but does not have the expected shape (wrong
 * version, missing stat arrays, or a pfrId/season that does not match its
 * key). A corrupt object is a data problem to surface, not a corpus miss, so
 * it is never reported as "no data".
 */
export class PfaPayloadError extends Error {
  constructor(key: string, reason: string) {
    super(`Malformed PFA corpus object ${key}: ${reason}`);
    this.name = 'PfaPayloadError';
  }
}
