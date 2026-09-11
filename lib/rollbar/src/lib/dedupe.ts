/**
 * Client-side de-duplication shared by every Rollbar platform implementation.
 *
 * Collapses a burst of identical items (same fingerprint — typically
 * `severity + message`) to a single report per rolling window. Rollbar's
 * `rollbar` npm package enforces two per-client budgets regardless of
 * platform: `itemsPerMinute` and `maxItems` (total items for the life of the
 * client instance). A single repeating error can exhaust either one in
 * seconds, which causes Rollbar to start silently dropping *distinct* real
 * errors and emit its own "ignoring errors until reset" notices. Originally
 * added to the Node implementation only (LS-8343); LS-8764 found the same
 * failure mode tripping `maxItems` on the Web and React Native clients,
 * which had no de-duplication at all.
 */

/** Default rolling window (ms) over which identical items are collapsed to a single Rollbar report. */
export const DEFAULT_DEDUPE_WINDOW_MS = 60_000;

/**
 * Cap on the number of distinct fingerprints tracked for de-duplication. Bounds
 * memory in a long-running process/session; when exceeded, the entry with the
 * oldest window is evicted (it is the least likely to still be inside its window).
 */
const MAX_TRACKED_FINGERPRINTS = 500;

/** Per-fingerprint de-duplication bookkeeping within the current window. */
interface DedupeEntry {
  /** Epoch ms at which the current window started. */
  windowStart: number;
  /** Occurrences suppressed since the last report of this fingerprint. */
  suppressed: number;
}

/** Result of evaluating a fingerprint against the current de-dup window. */
export interface DedupeResult {
  /** Whether this occurrence should be reported to Rollbar. */
  report: boolean;
  /** When `report` is true, how many prior occurrences of this fingerprint were suppressed since the last report. */
  suppressed: number;
}

/**
 * Tracks per-fingerprint rolling windows and decides whether a given
 * occurrence should be reported or suppressed. One instance is owned per
 * Rollbar platform implementation (Node, Web, React Native).
 */
export class RollbarDeduper {
  private dedupeWindowMs: number;
  private dedupeState = new Map<string, DedupeEntry>();

  constructor(dedupeWindowMs: number = DEFAULT_DEDUPE_WINDOW_MS) {
    this.dedupeWindowMs = dedupeWindowMs;
  }

  /** Re-configure the window (e.g. on re-init) and clear prior state. */
  configure(dedupeWindowMs: number): void {
    this.dedupeWindowMs = dedupeWindowMs;
    this.dedupeState.clear();
  }

  /**
   * Evaluate `fingerprint` at time `now`. Returns whether to report it and,
   * when a new window opens, how many identical occurrences were suppressed
   * during the prior window (attach as `suppressedSinceLastReport` so burst
   * volume stays visible even though most of it never reaches Rollbar).
   */
  apply(fingerprint: string, now: number): DedupeResult {
    if (this.dedupeWindowMs <= 0) {
      return { report: true, suppressed: 0 };
    }
    const entry = this.dedupeState.get(fingerprint);
    if (!entry || now - entry.windowStart >= this.dedupeWindowMs) {
      const suppressed = entry?.suppressed ?? 0;
      this.dedupeState.set(fingerprint, { windowStart: now, suppressed: 0 });
      this.evictStaleFingerprints();
      return { report: true, suppressed };
    }
    entry.suppressed += 1;
    return { report: false, suppressed: 0 };
  }

  private evictStaleFingerprints(): void {
    if (this.dedupeState.size <= MAX_TRACKED_FINGERPRINTS) return;
    let oldestKey: string | null = null;
    let oldestWindowStart = Infinity;
    for (const [key, entry] of this.dedupeState) {
      if (entry.windowStart < oldestWindowStart) {
        oldestWindowStart = entry.windowStart;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) {
      this.dedupeState.delete(oldestKey);
    }
  }
}
