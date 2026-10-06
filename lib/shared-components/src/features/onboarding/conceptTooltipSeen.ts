/**
 * Per-term "understood" persistence for `ConceptTooltip` (LS-6886 / OBD-009).
 *
 * Once a user acknowledges a concept with the card's "Got it" control, the
 * term is recorded under `ls_tooltip_seen_<term>` so hovering it no longer
 * re-opens the card on later visits (an explicit press/tap/keyboard toggle
 * still does). Guarded like `footballHomeSessionState.ts`: native has no
 * `localStorage` global, so every access degrades to "not seen" / no-op.
 */

const TOOLTIP_SEEN_PREFIX = 'ls_tooltip_seen_';

/** Storage key for a term: lowercased, whitespace runs collapsed to `-`. */
export function getConceptTooltipSeenKey(term: string): string {
  return `${TOOLTIP_SEEN_PREFIX}${term.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

export function readConceptTooltipSeen(term: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(getConceptTooltipSeenKey(term)) === '1';
  } catch {
    return false;
  }
}

export function writeConceptTooltipSeen(term: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(getConceptTooltipSeenKey(term), '1');
  } catch {
    // localStorage unavailable — the term just keeps opening on hover
  }
}
