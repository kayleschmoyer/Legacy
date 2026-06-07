/**
 * Shared draft-status formatting and colour utilities.
 *
 * Originally extracted from the web LeagueCard fork — now the canonical
 * shared component at ./components/LeagueCard.tsx — and consumed broadly
 * across web and shared-components. Both web and mobile import these
 * instead of defining local copies.
 */

// ── Display Formatting ──────────────────────────────────────────────────────

export type DraftStatusStyle = 'card' | 'badge';

/**
 * Format a raw draft status string for display within a card listing.
 */
export function formatDraftStatusForCard(status?: string | null): string {
  if (!status) return 'Unknown';

  switch (status) {
    case 'not-started':
      return 'Not Started';
    case 'queued':
      return 'Queued';
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    default:
      return status
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

/**
 * Format a raw draft status string for inline badge display.
 */
export function formatDraftStatusForBadge(status?: string | null): string {
  if (!status) return 'Unknown';

  switch (status) {
    case 'not-started':
      return 'Pre-Draft';
    case 'queued':
      return 'Queued';
    case 'in-progress':
      return 'Drafting';
    case 'completed':
      return 'Season Active';
    default:
      return status.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

// ── Colour Mapping ──────────────────────────────────────────────────────────

export interface DraftStatusColors {
  /** Background colour token. */
  bg: string;
  /** Border colour token. */
  border: string;
  /** Text colour token. */
  text: string;
}

/**
 * Map a draft status to Tamagui colour tokens.
 */
export function getDraftStatusColors(
  status?: string | null,
): DraftStatusColors {
  switch (status) {
    case 'not-started':
      return { bg: '$gray3', border: '$gray7', text: '$gray11' };
    case 'queued':
      return { bg: '$amber3', border: '$amber7', text: '$amber11' };
    case 'in-progress':
      return { bg: '$blue3', border: '$blue7', text: '$blue11' };
    case 'completed':
      return { bg: '$green3', border: '$green7', text: '$green11' };
    default:
      return { bg: '$gray3', border: '$gray7', text: '$gray11' };
  }
}

// ── Copy / Descriptions ─────────────────────────────────────────────────────

/**
 * Commissioner-facing description for the current draft phase.
 */
export function getDraftStatusDescription(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return 'Lock in a draft window and share invites to fill the league.';
    case 'queued':
      return 'Draft room is warming up. Double-check keepers and queue sleepers.';
    case 'in-progress':
      return 'Live draft underway. Stay nimble on positional needs and matchups.';
    case 'completed':
      return 'Rosters are set. Shift focus to lineups, waivers, and weekly matchups.';
    default:
      return 'Keep your managers engaged with updates, trades, and matchup highlights.';
  }
}

/**
 * Suggested next-action copy for the commissioner.
 */
export function getDraftNextActionCopy(status?: string | null): string {
  switch (status) {
    case 'not-started':
      return 'Prep the rulebook and pin commissioner notes before managers join.';
    case 'queued':
      return 'Confirm every manager has draft access and a prioritized queue.';
    case 'in-progress':
      return 'Monitor the board and be ready to counter draft snipes in real time.';
    case 'completed':
      return 'Schedule weekly reminders so managers submit lineups ahead of first pitch.';
    default:
      return 'Keep the league vibrant with quick updates and timely reminders.';
  }
}
