/**
 * Auto-refresh cadence for the football player detail page.
 *
 * The detail page has no realtime/subscription channel for player updates such
 * as injury-status changes, so both the web and mobile containers poll the
 * `footballPlayer` query on this interval to surface status changes without a
 * manual refresh (LS-6252 / FPD-028). Apollo pauses polling while the document
 * is hidden and tears it down on unmount, so the cost stays bounded to
 * actively-viewed detail pages.
 */
export const FOOTBALL_PLAYER_DETAIL_POLL_MS = 60_000;
