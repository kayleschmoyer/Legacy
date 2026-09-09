import { LOGGER } from '@legacy-sports/logging';

/**
 * A conservative fixed-delay rate limiter for crawling Pro Football
 * Archives. PFA publishes no robots.txt and no crawl-delay (LS-9948:
 * "PFA has no robots.txt and no published crawl-delay — use a conservative
 * fixed delay and a descriptive User-Agent"), unlike PFR/BBRef which state
 * an explicit requests-per-minute policy. Absent a stated limit, this
 * defaults to a materially slower pace than PFR's stated 20/min so an
 * ~8-10k page crawl against a small independent site doesn't behave like a
 * denial-of-service attempt.
 */
export class PfaRateLimiter {
  private lastRequestAt: number | null = null;

  constructor(private readonly minDelayMs = 3_000) {
    if (minDelayMs < 0) {
      throw new Error('minDelayMs must be >= 0');
    }
  }

  /**
   * Resolves once it is safe to make the next request, sleeping as needed.
   * Call this immediately before every outbound request to PFA.
   */
  async waitForTurn(): Promise<void> {
    if (this.lastRequestAt !== null) {
      const elapsed = Date.now() - this.lastRequestAt;
      const remaining = this.minDelayMs - elapsed;
      if (remaining > 0) {
        LOGGER.debug(`PFA rate limiter: sleeping ${remaining}ms`);
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    }
    this.lastRequestAt = Date.now();
  }

  reset(): void {
    this.lastRequestAt = null;
  }
}

export const PFA_USER_AGENT =
  'legacy-sports-stats-bot/1.0 (+https://github.com/legacy-sports; ' +
  'one-time historical stats crawl, contact via repository issues)';
