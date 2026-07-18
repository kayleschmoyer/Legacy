import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';

// Max 20 requests/minute = ~3 second minimum delay between requests.
// PFR shares the same robots.txt constraint as Baseball Reference.
const MAX_REQUESTS_PER_MINUTE = 20;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 15_000;
const BACKOFF_MULTIPLIER = 2;

// Bound every request so a stuck socket (e.g. a dropped tunnel/VPN) errors and
// the caller can move on, instead of hanging a long backfill indefinitely.
const REQUEST_TIMEOUT_MS = 45_000;

let lastRequest: number;

const responseCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Build per-request axios config. PFR sits behind Cloudflare; from a non-allowed
 * network (e.g. local dev) a valid `cf_clearance` cookie plus the *exact*
 * matching browser User-Agent are required. When `PFR_CF_CLEARANCE` /
 * `PFR_USER_AGENT` are set in the environment they are attached to every
 * request, so any PFR-backed command works against live PFR without a wrapper.
 * Unset in normal/server environments — then no auth headers are added.
 */
function pfrRequestConfig(): {
  headers: Record<string, string>;
  timeout: number;
} {
  const headers: Record<string, string> = {};
  const ua = process.env.PFR_USER_AGENT;
  const cf = process.env.PFR_CF_CLEARANCE;
  if (ua) headers['User-Agent'] = ua;
  if (cf) headers['Cookie'] = `cf_clearance=${cf}`;
  return { headers, timeout: REQUEST_TIMEOUT_MS };
}

export async function getFromProFootballReference(
  url: string,
): Promise<string> {
  const cached = responseCache.get(url);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      LOGGER.debug(`Cache HIT for ${url} (age: ${Math.round(age / 1000)}s)`);
      return cached.data;
    } else {
      LOGGER.debug(
        `Cache EXPIRED for ${url} (age: ${Math.round(age / 1000)}s)`,
      );
      responseCache.delete(url);
    }
  }

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
      LOGGER.debug(`Fetching from Pro Football Reference: ${url}`);
      const response = await axios.get<string>(url, pfrRequestConfig());

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

      if (isRateLimitOrOverload && attempt < MAX_RETRIES) {
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
        lastRequest = Date.now();
        continue;
      }

      if (isRateLimitOrOverload) {
        LOGGER.warn(
          `Got ${status} for ${url} after ${MAX_RETRIES} retries. Giving up.`,
        );
      }

      // A 403 means Cloudflare blocked the request outright — retrying won't
      // help (unlike 429/529, which clear on their own). This is almost
      // always a missing/expired cf_clearance cookie (~30min TTL) rather than
      // an application bug; surface the documented fix instead of a bare
      // AxiosError. See apps/cli/src/commands/queue-players.md.
      if (status === 403) {
        throw new Error(
          `PFR blocked the request with 403 (Cloudflare) for ${url}. The ` +
            `cf_clearance cookie is likely missing or expired (~30min TTL) ` +
            `— re-pull it from DevTools and set PFR_CF_CLEARANCE/` +
            `PFR_USER_AGENT, then resume with --letter. See ` +
            `apps/cli/src/commands/queue-players.md.`,
        );
      }

      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`);
}

// Strict path-segment validators prevent path traversal in PFR URLs. "."
// is allowed for dotted PFR IDs (e.g. "BrowC.20" from A.J./C.J./T.J./D.J.
// given names), but a segment of dots alone (".", "..", "...") is rejected —
// real PFR IDs always start with a surname letter, and pfrId is interpolated
// between literal slashes in getPlayerGameLog, so an all-dots value could
// otherwise traverse out of the /players/ path. "-", "_", and "'" are also
// allowed for hyphenated/compound surnames, underscored IDs, and
// apostrophe'd names (e.g. "El-MHi20", "Cox_Mi20", "O'ShJa00") — none
// introduces traversal risk since "/" remains excluded.
const VALID_PFR_ID = /^[A-Za-z0-9._'-]{1,20}$/;
const ALL_DOTS = /^\.+$/;
const VALID_LETTER = /^[A-Za-z]$/;
const VALID_TEAM_ABBR = /^[A-Za-z]{2,3}$/;

function assertPathSegment(value: string, name: string, regex: RegExp): void {
  if (!regex.test(value)) {
    throw new Error(`Invalid ${name}: "${value}"`);
  }
}

function assertPfrId(pfrId: string): void {
  assertPathSegment(pfrId, 'pfrId', VALID_PFR_ID);
  if (ALL_DOTS.test(pfrId)) {
    throw new Error(`Invalid pfrId: "${pfrId}"`);
  }
}

export function getPlayersList(letter: string): Promise<string> {
  assertPathSegment(letter, 'letter', VALID_LETTER);
  return getFromProFootballReference(
    `https://www.pro-football-reference.com/players/${letter.toUpperCase()}/`,
  );
}

export function getPlayerPage(pfrId: string): Promise<string> {
  assertPfrId(pfrId);
  const firstLetter = pfrId[0].toUpperCase();
  return getFromProFootballReference(
    `https://www.pro-football-reference.com/players/${firstLetter}/${pfrId}.htm`,
  );
}

export function getPlayerGameLog(pfrId: string, year: number): Promise<string> {
  assertPfrId(pfrId);
  const firstLetter = pfrId[0].toUpperCase();
  return getFromProFootballReference(
    `https://www.pro-football-reference.com/players/${firstLetter}/${pfrId}/gamelog/${year}/`,
  );
}

export function getTeamDefenseGameLog(
  team: string,
  year: number,
): Promise<string> {
  assertPathSegment(team, 'team', VALID_TEAM_ABBR);
  return getFromProFootballReference(
    `https://www.pro-football-reference.com/teams/${team.toLowerCase()}/${year}/gamelog/`,
  );
}

export function cleanupCache(): number {
  const now = Date.now();
  let removed = 0;

  for (const [url, entry] of responseCache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
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

export function clearCache(): void {
  const size = responseCache.size;
  responseCache.clear();
  if (size > 0) {
    LOGGER.info(`Cleared entire response cache (${size} entries removed)`);
  }
}

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
