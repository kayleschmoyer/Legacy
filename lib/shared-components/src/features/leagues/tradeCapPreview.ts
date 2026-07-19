/**
 * tradeCapPreview — pure salary-cap math for the TradingCenter TradeOfferCard.
 *
 * In a salary-cap (premium) league a trade can be valid on player count yet
 * violate the cap, and the backend only rejects it when the user clicks Accept
 * (LS-5971 / BLD-038). These helpers compute the salary impact of a trade for
 * the viewing team so the card can preview the cap delta and warn before Accept.
 *
 * Salaries are whole dollars, matching `player_salaries.current_salary`,
 * `team_members.salary`, and `leagues.salary_cap` on the backend.
 */

/** A single player leg of a trade, narrowed to the fields cap math needs. */
export interface TradeCapPlayer {
  fromTeamId?: number | null;
  salary?: number | null;
}

export interface TradeCapPreview {
  /** Total salary the viewing team takes on (players it receives). */
  incomingSalary: number;
  /** Total salary the viewing team sheds (players it sends away). */
  outgoingSalary: number;
  /** Net change to the viewing team's payroll (incoming − outgoing). */
  netSalaryDelta: number;
  /**
   * Projected payroll after the trade, or null when the team's current payroll
   * is unknown (e.g. the team query hasn't loaded).
   */
  projectedPayroll: number | null;
  /**
   * True when the trade would push the viewing team's payroll over the cap.
   * Always false when the cap or current payroll is unknown.
   */
  exceedsCap: boolean;
  /** Dollars over the cap after the trade (0 when within cap or unknown). */
  overCapBy: number;
}

/**
 * Compute the salary-cap impact of a trade for the viewing team.
 *
 * Returns null when no cap preview should be shown: the viewer is not a
 * participant in the trade, or no leg carries salary data (non-cap league).
 *
 * The over-cap check mirrors the backend's authoritative Accept-time
 * validation: post-trade payroll = current payroll − outgoing + incoming, and
 * the trade is over the cap when that exceeds `salaryCap`.
 */
export function computeTradeCapPreview(params: {
  players: readonly TradeCapPlayer[];
  viewerTeamId: number;
  salaryCap?: number | null;
  /** The viewing team's current total payroll (sum of team_members.salary). */
  currentPayroll?: number | null;
}): TradeCapPreview | null {
  const { players, viewerTeamId, salaryCap, currentPayroll } = params;

  // Only render a preview when at least one leg carries salary data. In a
  // non-cap league every salary is null, so the preview is suppressed.
  const hasSalaryData = players.some((p) => p.salary != null);
  if (!hasSalaryData) return null;

  // The viewer must be a party to the trade for a "your cap" preview to make
  // sense (e.g. a commissioner viewing an unrelated trade in history is not).
  const isParticipant = players.some((p) => p.fromTeamId === viewerTeamId);
  if (!isParticipant) return null;

  let incomingSalary = 0;
  let outgoingSalary = 0;
  for (const p of players) {
    const salary = p.salary ?? 0;
    if (p.fromTeamId === viewerTeamId) {
      // Player leaving the viewer's roster → salary comes off the cap.
      outgoingSalary += salary;
    } else {
      // Player joining the viewer's roster → salary added to the cap.
      incomingSalary += salary;
    }
  }

  const netSalaryDelta = incomingSalary - outgoingSalary;

  const projectedPayroll =
    currentPayroll != null ? currentPayroll + netSalaryDelta : null;

  const exceedsCap =
    salaryCap != null &&
    projectedPayroll != null &&
    projectedPayroll > salaryCap;

  const overCapBy =
    exceedsCap && salaryCap != null && projectedPayroll != null
      ? projectedPayroll - salaryCap
      : 0;

  return {
    incomingSalary,
    outgoingSalary,
    netSalaryDelta,
    projectedPayroll,
    exceedsCap,
    overCapBy,
  };
}

/** Format a whole-dollar salary amount, e.g. 1500000 → "$1,500,000". */
export function formatSalary(dollars: number): string {
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US')}`;
}

/** Format a signed salary delta, e.g. 500 → "+$500", -500 → "-$500". */
export function formatSalaryDelta(dollars: number): string {
  const sign = dollars > 0 ? '+' : dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US')}`;
}
