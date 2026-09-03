import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { LOGGER } from '@legacy-sports/logging';
import { gunzipSync } from 'node:zlib';

import { buildObjectKey, type RetrosheetSeasonPayload } from './types';

/**
 * Environment configuration.
 *
 * When `RETROSHEET_S3_BUCKET` is unset the provider is considered disabled and
 * every lookup reports a miss, so callers transparently fall back to the
 * Baseball Reference scraper. That keeps local development, unit tests and any
 * not-yet-migrated environment working with no code change.
 */
const BUCKET_ENV = 'RETROSHEET_S3_BUCKET';
const PREFIX_ENV = 'RETROSHEET_S3_PREFIX';

/**
 * Request-scoped memo. The loader calls batting -> pitching -> fielding in
 * sequence for the SAME (player, season), so without this each player-season
 * would cost three GETs instead of one. Storing the in-flight promise (rather
 * than the resolved value) also collapses concurrent callers onto one request.
 *
 * Mirrors the response cache in `BRefSession`, including its warm-container
 * lifetime assumption.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 512;

interface CacheEntry {
  at: number;
  value: Promise<RetrosheetSeasonPayload | null>;
}

const cache = new Map<string, CacheEntry>();

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client === null) {
    client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return client;
}

/** True when a Retrosheet bucket is configured for this environment. */
export function isRetrosheetConfigured(): boolean {
  return Boolean(process.env[BUCKET_ENV]);
}

function evictIfNeeded(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }
  // Map preserves insertion order, so the first key is the oldest.
  const oldest = cache.keys().next();
  if (!oldest.done) {
    cache.delete(oldest.value);
  }
}

/**
 * A missing object is an expected outcome, not an error: the Retrosheet CSV
 * corpus starts at 1897, so every pre-1897 player-season legitimately 404s and
 * must fall through to the scraper.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

async function fetchPayload(
  brefId: string,
  season: number,
): Promise<RetrosheetSeasonPayload | null> {
  const bucket = process.env[BUCKET_ENV];
  if (!bucket) {
    return null;
  }

  const key = buildObjectKey(process.env[PREFIX_ENV] ?? '', brefId, season);

  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) {
      return null;
    }
    const compressed = Buffer.from(await response.Body.transformToByteArray());
    const payload = JSON.parse(
      gunzipSync(compressed).toString('utf-8'),
    ) as RetrosheetSeasonPayload;

    LOGGER.debug(
      `Retrosheet S3 HIT for ${brefId} ${season} (batting=${payload.batting.length}, pitching=${payload.pitching.length}, fielding=${payload.fielding.length})`,
    );
    return payload;
  } catch (error) {
    if (isNotFound(error)) {
      LOGGER.debug(
        `Retrosheet S3 MISS for ${brefId} ${season} (${key}) — falling back to Baseball Reference`,
      );
      return null;
    }
    // A genuine S3 failure (throttling, permissions, network) must not be
    // silently converted into a scrape: that would quietly re-introduce the
    // rate-limited path for the whole corpus. Surface it and let the caller's
    // retry semantics handle it.
    LOGGER.error(
      `Retrosheet S3 read failed for ${brefId} ${season} (${key})`,
      error as Error,
    );
    throw error;
  }
}

/**
 * Load the Retrosheet payload for a player-season, or `null` when the corpus
 * does not cover it (caller should fall back to scraping).
 */
export function getSeasonPayload(
  brefId: string,
  season: number,
): Promise<RetrosheetSeasonPayload | null> {
  if (!isRetrosheetConfigured()) {
    return Promise.resolve(null);
  }

  const cacheKey = `${brefId}:${season}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  if (cached) {
    cache.delete(cacheKey);
  }

  const value = fetchPayload(brefId, season).catch((error) => {
    // Never memoize a failure — the next caller should get a fresh attempt.
    cache.delete(cacheKey);
    throw error;
  });

  cache.set(cacheKey, { at: Date.now(), value });
  evictIfNeeded();
  return value;
}

/** Test/maintenance helper mirroring `clearCache` in bref-client. */
export function clearRetrosheetCache(): void {
  cache.clear();
}

/** Test helper: allows injecting a stubbed S3 client. */
export function __setS3ClientForTesting(next: S3Client | null): void {
  client = next;
}
