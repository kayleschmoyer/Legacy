/**
 * Scheduling strategy interface
 * 
 * Each strategy implements different logic for pairing teams
 */

import type { MatchupPairing, TeamInfo } from '../types';

export interface SchedulingStrategy {
  /**
   * Generate team pairings for a given set of teams and weeks
   * @returns Array of matchup pairings (without season selection)
   */
  generatePairings(teams: TeamInfo[], numberOfWeeks: number): MatchupPairing[];

  /**
   * Strategy name for logging/debugging
   */
  getName(): string;
}

/**
 * Helper: Shuffle array in place (Fisher-Yates algorithm)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Helper: Check if a pairing already exists in an array
 */
export function pairingExists(
  pairings: MatchupPairing[],
  team1Id: number,
  team2Id: number,
  weekNumber: number
): boolean {
  return pairings.some(
    (p) =>
      p.weekNumber === weekNumber &&
      ((p.team1Id === team1Id && p.team2Id === team2Id) ||
        (p.team1Id === team2Id && p.team2Id === team1Id))
  );
}

/**
 * Helper: Check if a team is already paired in a week
 */
export function teamIsPairedInWeek(
  pairings: MatchupPairing[],
  teamId: number,
  weekNumber: number
): boolean {
  return pairings.some(
    (p) =>
      p.weekNumber === weekNumber &&
      (p.team1Id === teamId || p.team2Id === teamId)
  );
}
