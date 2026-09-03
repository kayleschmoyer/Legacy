import type {
  GameBatting,
  GameFielding,
  GamePitching,
} from '@legacy-sports/db-client';

/**
 * Current on-disk (in-S3) payload version. Bump alongside the `v1` path
 * segment in {@link buildObjectKey} whenever the stored shape changes so a
 * re-ingest can be rolled out without mutating existing objects in place.
 */
export const RETROSHEET_PAYLOAD_VERSION = 1;

/**
 * Rows are stored WITHOUT `playerId`: the app's surrogate player id is a
 * property of this database, not of the Retrosheet corpus. The provider
 * injects it at read time from the `Player` the caller already holds, which
 * keeps the S3 objects portable across environments (dev/prod share one
 * ingest) and stable if player ids are ever renumbered.
 *
 * `outsRecorded` is additionally omitted from pitching: it is a Postgres
 * GENERATED ALWAYS column derived from `ip`, so writing it would be rejected.
 */
export type StoredBatting = Omit<GameBatting, 'playerId'>;
export type StoredPitching = Omit<GamePitching, 'playerId' | 'outsRecorded'>;
export type StoredFielding = Omit<GameFielding, 'playerId'>;

/** One object per (brefId, season) holding all three stat families. */
export interface RetrosheetSeasonPayload {
  v: number;
  brefId: string;
  /** Retrosheet player id this was derived from — kept for traceability. */
  retroId: string;
  season: number;
  batting: StoredBatting[];
  pitching: StoredPitching[];
  fielding: StoredFielding[];
}

/**
 * S3 object key for a player-season.
 *
 * Keyed by `brefId` rather than the Retrosheet id so the Chadwick crosswalk
 * is applied once at ingest instead of on every read — callers already carry
 * `player.brefId`, so the read path needs no crosswalk at all.
 */
export function buildObjectKey(
  prefix: string,
  brefId: string,
  season: number,
): string {
  const normalized = prefix.replace(/^\/+|\/+$/g, '');
  const base = normalized.length > 0 ? `${normalized}/` : '';
  return `${base}retrosheet/v${RETROSHEET_PAYLOAD_VERSION}/${brefId}/${season}.json.gz`;
}
