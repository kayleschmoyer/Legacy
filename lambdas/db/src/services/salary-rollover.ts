/**
 * Salary Rollover Helpers (LS-645)
 *
 * Pure calculation functions for salary escalation and free-agent salary
 * decay applied during season rollover (`renewLeague`).
 *
 * Formulas from the Salary Cap Design spec:
 *   Escalation: Math.ceil(current * (100 + pct) / 100)
 *   Decay:      Math.max(minSalary, Math.floor(current * (100 - pct) / 100))
 */

/**
 * Apply salary escalation to a player carried over to a new season.
 *
 * @param currentSalary  - The player's current salary in whole dollars
 * @param escalationPct  - Whole-number escalation rate (e.g. 10 = 10%)
 * @returns The new escalated salary (always >= currentSalary when pct > 0)
 */
export function applyEscalation(
  currentSalary: number,
  escalationPct: number,
): number {
  return Math.ceil((currentSalary * (100 + escalationPct)) / 100);
}

/**
 * Apply salary decay to a player who spent the season as a free agent.
 *
 * @param currentSalary - The player's current salary in whole dollars
 * @param decayPct      - Whole-number decay rate (e.g. 25 = 25%)
 * @param minSalary     - Hard floor; salary will never go below this value
 * @returns The new decayed salary (always >= minSalary)
 */
export function applyDecay(
  currentSalary: number,
  decayPct: number,
  minSalary: number,
): number {
  return Math.max(
    minSalary,
    Math.floor((currentSalary * (100 - decayPct)) / 100),
  );
}
