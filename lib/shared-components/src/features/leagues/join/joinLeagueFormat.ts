/**
 * Pure formatters for the Join League browse ledger (LS-8812).
 *
 * The design's row meta line reads "12 tm · R25 · Golden Age · Auction · Aug 15" —
 * every segment is optional, so the line is assembled from whatever the league
 * actually exposes rather than rendering placeholder dashes.
 */

import type { PublicLeagueRow } from './joinLeagueTypes';
import { formatEraName } from '../../home/homeSummaryFormatters';

const SELECTION_METHOD_LABELS: Record<string, string> = {
  standard: 'Standard',
  auction: 'Auction',
  random: 'Random',
};

const DRAFT_ORDER_LABELS: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
};

/** "Auction" / "Standard" / "Random" — null for an unknown or absent value. */
export function formatSelectionMethod(value?: string | null): string | null {
  if (!value) return null;
  return SELECTION_METHOD_LABELS[value] ?? null;
}

/** "Snake" / "Linear" — null for an unknown or absent value. */
export function formatDraftOrder(value?: string | null): string | null {
  if (!value) return null;
  return DRAFT_ORDER_LABELS[value] ?? null;
}

/**
 * Short calendar day for the meta line, e.g. "Aug 15". Returns null for a
 * missing or unparseable date so the segment simply drops out of the line.
 */
export function formatDraftDay(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The dense browse-row meta line. Segments are omitted rather than blanked, so
 * a sparsely-configured league still reads cleanly.
 */
export function formatLeagueMetaLine(league: PublicLeagueRow): string {
  const parts: string[] = [];

  const teams = league.numberOfTeams ?? league.totalSpots;
  if (teams != null && teams > 0) parts.push(`${teams} tm`);

  if (league.maxRosterSize != null && league.maxRosterSize > 0) {
    parts.push(`R${league.maxRosterSize}`);
  }

  const era = formatEraName({ eraFilter: league.eraFilter });
  if (era) parts.push(era);

  const selection = formatSelectionMethod(league.selectionMethod);
  if (selection) parts.push(selection);

  const day = formatDraftDay(league.draftDate);
  if (day) parts.push(day);

  return parts.join(' · ');
}

/**
 * The spot fraction shown on the right of a browse row — "8/12" means eight of
 * twelve team slots are still unclaimed.
 */
export function formatSpotsFraction(league: PublicLeagueRow): string {
  const available = league.availableSpots ?? 0;
  const total = league.totalSpots ?? 0;
  return `${available}/${total}`;
}

/** Fraction of the league's slots already claimed, clamped to 0–1. */
export function spotMeterFill(
  availableSpots?: number | null,
  totalSpots?: number | null,
): number {
  const total = totalSpots ?? 0;
  if (total <= 0) return 0;
  const available = Math.min(Math.max(availableSpots ?? 0, 0), total);
  return (total - available) / total;
}

/** "3 of 12 spots left" — the label under the invite-code spot meter. */
export function formatSpotsRemaining(
  availableSpots?: number | null,
  totalSpots?: number | null,
): string {
  const available = Math.max(availableSpots ?? 0, 0);
  const total = Math.max(totalSpots ?? 0, 0);
  return `${available} of ${total} ${available === 1 ? 'spot' : 'spots'} left`;
}
