import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';

const MAX_REQUESTS_PER_MINUTE = 5; // Reduced from 10 to be more conservative

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
    // For 429 errors, throw immediately without retrying
    // Let SQS visibility timeout handle the retry delay instead of sleeping in Lambda
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      LOGGER.warn(
        `Got 429 Too Many Requests for ${url}. Failing fast to let SQS handle retry.`,
      );
      throw error;
    }

    // For all other errors, throw immediately
    throw error;
  }
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
