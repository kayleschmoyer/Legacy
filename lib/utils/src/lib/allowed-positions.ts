/**
 * Position eligibility mapping — single source of truth for the backend.
 *
 * Maps each league roster slot type to the player stat-position keys that qualify.
 * Includes the generic 'P' key to match career_fielding data for RP/SP slots.
 *
 * Frontend equivalent (without 'P'): @legacy-sports/shared-components ALLOWED_POSITIONS
 */
export const ALLOWED_POSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    C: ['C'],
    CF: ['CF'],
    DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
    IF: ['1B', '2B', '3B', 'SS'],
    LF: ['LF'],
    OF: ['LF', 'RF', 'CF'],
    RF: ['RF'],
    RP: ['RP', 'P'],
    SP: ['SP', 'P'],
    SS: ['SS'],
    XDH: ['DH'],
  });

/** Stat positions that count as pitching for auto-pick filtering (includes generic 'P'). */
export const PITCHING_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['SP', 'RP', 'P']),
);

/** Stat positions that count as batting for auto-pick filtering. */
export const BATTING_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']),
);
