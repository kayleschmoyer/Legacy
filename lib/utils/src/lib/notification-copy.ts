/**
 * Sport-aware notification copy utility (LS-4770).
 *
 * Provides a single `getNotificationCopy(eventType, sport)` entry point that
 * returns sport-appropriate text fragments for each notification event type.
 * Callers splice these fragments into their full title/body/embed strings.
 *
 * Back-compat: `sport` may be null/undefined (pre-LS-246 leagues). In that
 * case the function falls back to baseball — all existing leagues default to
 * `sport = 'baseball'` so this is purely a defensive guard.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Sport = 'baseball' | 'football';

/**
 * The set of notification event categories that produce human-readable copy.
 * Mirrors the union of push-notification types and Discord embed events.
 */
export type NotificationEventType =
  | 'matchup_recap'
  | 'score_alert'
  | 'lineup_reminder'
  | 'trade_proposed'
  | 'trade_accepted'
  | 'trade_rejected'
  | 'waiver_claimed'
  | 'draft_pick_made'
  | 'draft_completed';

/**
 * Sport-specific copy fragments returned for a given event type.
 *
 * Callers use these values to build complete notification strings:
 *
 *   Discord embed title:
 *     `Week ${recapWeek} ${copy.sportLabel} Recap — ${leagueName}`
 *
 *   Discord embed footer:
 *     copy.footerText
 *
 *   Player performance stat lines should use abbreviations from
 *   `copy.statAbbreviations` to avoid cross-sport terminology leakage.
 */
export interface NotificationCopyTemplate {
  /**
   * Sport-qualified label for use in titles and headings.
   * Examples: "Fantasy Baseball" | "Fantasy Football"
   */
  sportLabel: string;

  /**
   * Footer credit line for Discord embeds.
   * Examples: "Legacy Sports Baseball" | "Legacy Sports Football"
   */
  footerText: string;

  /**
   * Canonical stat abbreviations for this sport.
   *
   * Use these tokens when formatting player-performance summary lines.
   * These are the canonical abbreviations for each sport; callers are
   * responsible for using them when building stat summaries.
   *
   * Baseball: HR, RBI, AVG, ERA, K, SB
   * Football: TD, YDS, INT, REC
   */
  statAbbreviations: string[];
}

// ── Static copy maps ──────────────────────────────────────────────────────────

const BASEBALL_COPY: NotificationCopyTemplate = {
  sportLabel: 'Fantasy Baseball',
  footerText: 'Legacy Sports Baseball',
  statAbbreviations: ['HR', 'RBI', 'AVG', 'ERA', 'K', 'SB'],
};

const FOOTBALL_COPY: NotificationCopyTemplate = {
  sportLabel: 'Fantasy Football',
  footerText: 'Legacy Sports Football',
  statAbbreviations: ['TD', 'YDS', 'INT', 'REC'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns sport-appropriate notification copy for the given event type.
 *
 * The `eventType` parameter documents the calling context and enables
 * per-event customisation in future without breaking callers. Currently
 * the returned template varies only by sport.
 *
 * Falls back to baseball when `sport` is null or undefined.
 *
 * @example
 * const copy = getNotificationCopy('matchup_recap', league.sport);
 * embed.title = `Week ${week} ${copy.sportLabel} Recap — ${leagueName}`;
 * embed.footer = { text: copy.footerText };
 */
export function getNotificationCopy(
  _eventType: NotificationEventType,
  sport: Sport | null | undefined,
): NotificationCopyTemplate {
  return sport === 'football' ? FOOTBALL_COPY : BASEBALL_COPY;
}
