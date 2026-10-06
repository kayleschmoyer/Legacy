import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { LOGGER } from '@legacy-sports/logging';
import { gunzipSync } from 'node:zlib';

import {
  buildPfaObjectKey,
  isPfaSeason,
  PFA_PAYLOAD_VERSION,
  PfaPayloadError,
  type PfaPlayerSeasonPayload,
  resolveFootballCorpusKey,
} from './pfa-types';
import {
  buildPlayerObjectKey,
  buildTeamDefenseObjectKey,
  type NflversePlayerSeasonPayload,
  type NflverseTeamDefenseSeasonPayload,
} from './types';

/**
 * Environment configuration. Matches `terraform/main/football-corpus.tf`'s
 * `football_corpus_bucket` output.
 *
 * When `FOOTBALL_CORPUS_S3_BUCKET` is unset the provider is considered
 * disabled and every lookup reports a miss, so callers transparently fall
 * back to the live PFR scraper (`@legacy-sports/pfr-client`) — keeps local
 * development, unit tests, and any not-yet-migrated environment working with
 * no code change. Mirrors `RETROSHEET_S3_BUCKET` in
 * `@legacy-sports/game-stats-provider` (LS-9817).
 */
const BUCKET_ENV = 'FOOTBALL_CORPUS_S3_BUCKET';
const PREFIX_ENV = 'FOOTBALL_CORPUS_S3_PREFIX';

/**
 * Request-scoped memo, storing the in-flight promise (not the resolved
 * value) so concurrent callers for the same key collapse onto one GET —
 * identical rationale and shape to `getSeasonPayload` in
 * `@legacy-sports/game-stats-provider`'s `s3-store.ts` (LS-9817), which this
 * mirrors. A player's combined payload is fetched once per (pfrId, season)
 * even though the stats Lambda calls into CareerStats/IDPStats sequentially
 * for the same player-season.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 512;

interface CacheEntry<T> {
  at: number;
  value: Promise<T | null>;
}

const playerCache = new Map<string, CacheEntry<NflversePlayerSeasonPayload>>();
const teamDefenseCache = new Map<
  string,
  CacheEntry<NflverseTeamDefenseSeasonPayload>
>();
const pfaCache = new Map<string, CacheEntry<PfaPlayerSeasonPayload>>();

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client === null) {
    client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return client;
}

/** True when a football corpus bucket is configured for this environment. */
export function isFootballCorpusConfigured(): boolean {
  return Boolean(process.env[BUCKET_ENV]);
}

function evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>): void {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  // Map preserves insertion order, so the first key is the oldest.
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

/**
 * A missing object is an expected outcome, not an error: the nflverse corpus
 * only covers 1999-2025, and PFA-crosswalk gaps mean not every 1999+ player
 * is guaranteed to be present either — both cases must fall through to the
 * scraper, never throw.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

async function getObjectJson<T>(key: string): Promise<T | null> {
  const compressed = await getObjectBytes(key);
  return compressed === null
    ? null
    : (JSON.parse(gunzipSync(compressed).toString('utf-8')) as T);
}

async function getObjectBytes(key: string): Promise<Buffer | null> {
  const bucket = process.env[BUCKET_ENV];
  if (!bucket) return null;

  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
    if (isNotFound(error)) {
      LOGGER.debug(`Football corpus S3 MISS for ${key}`);
      return null;
    }
    // A genuine S3 failure (throttling, permissions, network) must not be
    // silently converted into a scrape: that would quietly reintroduce the
    // rate-limited PFR path for the whole corpus.
    LOGGER.error(`Football corpus S3 read failed for ${key}`, error as Error);
    throw error;
  }
}

function memoize<T>(
  cache: Map<string, CacheEntry<T>>,
  cacheKey: string,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (cached) cache.delete(cacheKey);

  const value = fetcher().catch((error) => {
    // Never memoize a failure — the next caller should get a fresh attempt.
    cache.delete(cacheKey);
    throw error;
  });

  cache.set(cacheKey, { at: Date.now(), value });
  evictIfNeeded(cache);
  return value;
}

/**
 * Load the nflverse-sourced payload for a player-season, or `null` when the
 * corpus does not cover it (caller should fall back to `pfr-client`).
 */
export function getPlayerSeasonPayload(
  pfrId: string,
  season: number,
): Promise<NflversePlayerSeasonPayload | null> {
  if (!isFootballCorpusConfigured()) return Promise.resolve(null);

  return memoize(playerCache, `${pfrId}:${season}`, () =>
    getObjectJson<NflversePlayerSeasonPayload>(
      buildPlayerObjectKey(process.env[PREFIX_ENV] ?? '', pfrId, season),
    ),
  );
}

/**
 * Load the nflverse-sourced team defense payload for a (nflTeam, season), or
 * `null` when the corpus does not cover it.
 */
export function getTeamDefenseSeasonPayload(
  nflTeam: string,
  season: number,
): Promise<NflverseTeamDefenseSeasonPayload | null> {
  if (!isFootballCorpusConfigured()) return Promise.resolve(null);

  return memoize(teamDefenseCache, `${nflTeam.toUpperCase()}:${season}`, () =>
    getObjectJson<NflverseTeamDefenseSeasonPayload>(
      buildTeamDefenseObjectKey(process.env[PREFIX_ENV] ?? '', nflTeam, season),
    ),
  );
}

/**
 * Decode and shape-check a PFA object. Any failure here (bad gzip, bad JSON,
 * wrong version, missing arrays, or a pfrId/season that does not match the
 * key it was stored under) throws {@link PfaPayloadError}: the object exists,
 * so reporting it as a corpus miss would hide corrupt data.
 */
function decodePfaPayload(
  key: string,
  compressed: Buffer,
  corpusKey: string,
  season: number,
): PfaPlayerSeasonPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(compressed).toString('utf-8'));
  } catch (error) {
    throw new PfaPayloadError(
      key,
      `cannot decode (${(error as Error).message})`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PfaPayloadError(key, 'not a JSON object');
  }
  const payload = parsed as Partial<
    Record<keyof PfaPlayerSeasonPayload, unknown>
  >;
  if (payload.v !== PFA_PAYLOAD_VERSION) {
    throw new PfaPayloadError(key, `unsupported version ${String(payload.v)}`);
  }
  const heldKey = resolveFootballCorpusKey({
    pfrId: typeof payload.pfrId === 'string' ? payload.pfrId : null,
    pfaId: typeof payload.pfaId === 'string' ? payload.pfaId : null,
  });
  if (heldKey !== corpusKey || payload.season !== season) {
    throw new PfaPayloadError(
      key,
      `holds ${String(heldKey)} ${String(payload.season)}, expected ${corpusKey} ${season}`,
    );
  }
  const normalized: Record<string, unknown> = { ...payload };
  let passingRowsWithoutInt = 0;
  for (const family of [
    'passing',
    'rushing',
    'receiving',
    'kicking',
  ] as const) {
    const rows = payload[family];
    if (!Array.isArray(rows)) {
      throw new PfaPayloadError(key, `"${family}" is not an array`);
    }
    normalized[family] = (rows as unknown[]).map((row) => {
      const r = row as Record<string, unknown> | null;
      if (
        typeof r !== 'object' ||
        r === null ||
        typeof r.gameNum !== 'number' ||
        typeof r.gameIdentifier !== 'string'
      ) {
        throw new PfaPayloadError(key, `"${family}" has a malformed row`);
      }
      // Objects staged before the LS-9995 ingest (the LS-9948 build on dev)
      // carry the season only at the top level. The consumer copies
      // `row.season` into a NOT NULL column, so a missing one failed every
      // pre-1999 insert (LS-10820). The payload season is already checked
      // against the key above, so it is authoritative for every row.
      if (r.season !== undefined && r.season !== season) {
        throw new PfaPayloadError(
          key,
          `"${family}" row holds season ${JSON.stringify(r.season)}, expected ${season}`,
        );
      }
      const out: Record<string, unknown> = { ...r, season };
      if (family === 'passing' && r.int === undefined) {
        // Same pre-LS-9995 objects: interceptions are absent under `int`.
        // Accept the long name if that is where they live; otherwise the
        // value is unknown (null), never a fabricated 0.
        out.int = typeof r.interceptions === 'number' ? r.interceptions : null;
        if (out.int === null) passingRowsWithoutInt++;
      }
      return out;
    });
  }
  if (passingRowsWithoutInt > 0) {
    LOGGER.warn(
      `PFA corpus object ${key} has ${passingRowsWithoutInt} passing row(s) with no interceptions value; loading them with interceptions = null. Re-ingest with ingest-pfa-football --force to restore them.`,
    );
  }
  return normalized as unknown as PfaPlayerSeasonPayload;
}

/**
 * Load the PFA payload for a 1960-1998 player-season, addressed by the
 * player's corpus key (`resolveFootballCorpusKey`), or `null` when the
 * corpus has no object for it (crosswalk miss, no games that season, a
 * season outside 1960-1998, or no bucket configured). A non-404 S3 error or
 * a malformed object throws.
 */
export function getPfaPlayerSeasonPayload(
  corpusKey: string,
  season: number,
): Promise<PfaPlayerSeasonPayload | null> {
  if (!isFootballCorpusConfigured() || !isPfaSeason(season)) {
    return Promise.resolve(null);
  }

  const key = buildPfaObjectKey(
    process.env[PREFIX_ENV] ?? '',
    corpusKey,
    season,
  );
  return memoize(pfaCache, `${corpusKey}:${season}`, async () => {
    const compressed = await getObjectBytes(key);
    return compressed === null
      ? null
      : decodePfaPayload(key, compressed, corpusKey, season);
  });
}

/** Test/maintenance helper mirroring `clearRetrosheetCache`. */
export function clearFootballCorpusCache(): void {
  playerCache.clear();
  teamDefenseCache.clear();
  pfaCache.clear();
}

/** Test helper: allows injecting a stubbed S3 client. */
export function __setS3ClientForTesting(next: S3Client | null): void {
  client = next;
}
