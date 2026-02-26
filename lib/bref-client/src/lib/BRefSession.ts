import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';

// 15 requests/minute = ~4 second delays between requests
// With reserved_concurrent_executions=1 and batch_size=5, worst case:
//   5 messages × 8 players × 3 stat types = 120 requests × 4s = 480s (safe for 600s timeout)
//   In practice, caching means far fewer actual HTTP requests per invocation
const MAX_REQUESTS_PER_MINUTE = 15;

// Exponential backoff config for rate limit (429) and overload (529) responses
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 15_000; // 15 seconds
const BACKOFF_MULTIPLIER = 2; // 15s -> 30s -> 60s

let lastRequest: number;

// In-memory cache for Baseball Reference HTML responses
// Cache key format: URL string
// Cache survives within Lambda warm container (typically ~15 minutes)
const responseCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes - matches typical Lambda warm duration

export async function getFromBaseballReference(url: string): Promise<string> {
  // Check cache first
  const cached = responseCache.get(url);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      LOGGER.debug(`Cache HIT for ${url} (age: ${Math.round(age / 1000)}s)`);
      return cached.data;
    } else {
      // Expired - remove from cache
      LOGGER.debug(
        `Cache EXPIRED for ${url} (age: ${Math.round(age / 1000)}s)`,
      );
      responseCache.delete(url);
    }
  }
  // Rate limiting - ensure we don't exceed MAX_REQUESTS_PER_MINUTE
  if (lastRequest) {
    const delta = Date.now() - lastRequest;
    const sleepLength = (60 * 1000) / MAX_REQUESTS_PER_MINUTE - delta;
    if (sleepLength > 0) {
      LOGGER.debug(`Sleeping ${sleepLength}ms for rate limiting`);
      await new Promise((res) => setTimeout(res, sleepLength));
    }
  }

  lastRequest = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      LOGGER.debug(`Fetching from Baseball Reference: ${url}`);
      const response = await axios.get<string>(url);

      // Store in cache
      responseCache.set(url, {
        data: response.data,
        timestamp: Date.now(),
      });
      LOGGER.debug(
        `Cached response for ${url} (size: ${response.data.length} bytes)`,
      );

      return response.data;
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      const isRateLimitOrOverload = status === 429 || status === 529;

      // For rate limit / overload errors, retry with exponential backoff
      if (isRateLimitOrOverload && attempt < MAX_RETRIES) {
        // Respect Retry-After header if present (BR sends seconds until unblock)
        const retryAfterHeader = axios.isAxiosError(error)
          ? (error.response?.headers?.['retry-after'] as string | undefined)
          : undefined;
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1_000
          : undefined;

        const exponentialMs =
          INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
        const backoffMs =
          retryAfterMs && retryAfterMs > 0 ? retryAfterMs : exponentialMs;

        LOGGER.warn(
          `Got ${status} for ${url}. ` +
            (retryAfterMs ? `Retry-After: ${retryAfterHeader}s. ` : '') +
            `Backing off ${Math.round(backoffMs / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}`,
        );
        await new Promise((res) => setTimeout(res, backoffMs));
        // Re-apply rate limiting timestamp so the next request respects spacing
        lastRequest = Date.now();
        continue;
      }

      // Final attempt exhausted or non-retryable error — throw
      if (isRateLimitOrOverload) {
        LOGGER.warn(
          `Got ${status} for ${url} after ${MAX_RETRIES} retries. Giving up.`,
        );
      }
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`);
}

export function getPlayers(letter: string): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/${letter}/`,
  );
}

export function getCareerStats(brefId: string): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml`,
  );
}

export function getGameStats(
  brefId: string,
  statType: 'b' | 'p' | 'f',
  season: number,
): Promise<string> {
  return getFromBaseballReference(
    `https://www.baseball-reference.com/players/gl.fcgi?id=${brefId}&t=${statType}&year=${season}`,
  );
}

/**
 * Clean up expired entries from the response cache.
 * Call this periodically in long-running Lambda containers to prevent memory bloat.
 * @returns Number of entries removed from cache
 */
export function cleanupCache(): number {
  const now = Date.now();
  let removed = 0;

  for (const [url, entry] of responseCache.entries()) {
    const age = now - entry.timestamp;
    if (age >= CACHE_TTL_MS) {
      responseCache.delete(url);
      removed++;
    }
  }

  if (removed > 0) {
    LOGGER.info(
      `Cleaned up ${removed} expired cache entries. Cache size now: ${responseCache.size}`,
    );
  }

  return removed;
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(responseCache.values());

  return {
    totalEntries: responseCache.size,
    avgAgeSeconds:
      entries.length > 0
        ? Math.round(
            entries.reduce((sum, e) => sum + (now - e.timestamp), 0) /
              entries.length /
              1000,
          )
        : 0,
    totalSizeBytes: entries.reduce((sum, e) => sum + e.data.length, 0),
  };
}
