import { LOGGER } from '@legacy-sports/logging';
import { parsePlayerIndexPage } from './PlayerIndexParser';
import { PFA_USER_AGENT, PfaRateLimiter } from './RateLimiter';
import type {
  PfaLeague,
  PfaPlayerIndexCrawlError,
  PfaPlayerIndexSourceTable,
} from './types';

export const PFA_BASE_URL = 'https://www.profootballarchives.com';

const PLAYER_INDEX_LEAGUES: PfaLeague[] = ['nfl', 'afl', 'aafc'];
const PLAYER_INDEX_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

/**
 * Every PFA player-index page URL: 3 leagues x 26 letters = 78 pages, per
 * LS-9993 AC #1.
 */
export function buildPlayerIndexUrls(baseUrl: string = PFA_BASE_URL): string[] {
  const urls: string[] = [];
  for (const league of PLAYER_INDEX_LEAGUES) {
    for (const letter of PLAYER_INDEX_LETTERS) {
      urls.push(`${baseUrl}/${league}players-${letter}.html`);
    }
  }
  return urls;
}

export interface CrawlPlayerIndexDeps {
  fetchImpl?: typeof fetch;
  rateLimiter?: PfaRateLimiter;
  urls?: string[];
}

/**
 * Crawls every PFA player-index page into a single source table (LS-9993 AC
 * #1). Never throws on a single page's failure — a bad page (network error,
 * non-200 response, or zero parsed entries) is recorded in `errors` and the
 * crawl continues, so one flaky page can't silently truncate the other 77.
 *
 * NOTE: requires outbound network access to profootballarchives.com. See
 * lib/pfa-client/README.md — this has been confirmed blocked by the network
 * egress policy in at least two independent development environments for
 * this package (LS-9991, LS-9993). Run this from an environment with
 * unrestricted egress before relying on its output.
 */
export async function crawlPlayerIndex(
  deps: CrawlPlayerIndexDeps = {},
): Promise<PfaPlayerIndexSourceTable> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const rateLimiter = deps.rateLimiter ?? new PfaRateLimiter();
  const urls = deps.urls ?? buildPlayerIndexUrls();

  const entries: PfaPlayerIndexSourceTable['entries'] = [];
  const errors: PfaPlayerIndexCrawlError[] = [];

  for (const url of urls) {
    await rateLimiter.waitForTurn();
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': PFA_USER_AGENT },
      });
      if (!response.ok) {
        errors.push({ url, message: `HTTP ${response.status}` });
        LOGGER.warn(
          `PFA player-index crawl: ${url} returned HTTP ${response.status}`,
        );
        continue;
      }
      const html = await response.text();
      const pageEntries = parsePlayerIndexPage(html, url);
      if (pageEntries.length === 0) {
        errors.push({ url, message: 'parsed zero entries' });
      }
      entries.push(...pageEntries);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ url, message });
      LOGGER.warn(`PFA player-index crawl: ${url} failed`, {
        error: err instanceof Error ? err : message,
      });
    }
  }

  return { crawledAt: new Date().toISOString(), entries, errors };
}
