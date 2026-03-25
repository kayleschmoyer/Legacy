/**
 * Round-robin scheduling strategy
 *
 * Each team plays every other team exactly once.
 * Handles both even and odd number of teams (bye weeks for odd).
 * Ensures home/away balance over the season.
 *
 * Algorithm: Circle method for round-robin scheduling
 * See: https://en.wikipedia.org/wiki/Round-robin_tournament#Scheduling_algorithm
 */

import type { SchedulingStrategy } from './strategy-interface';
import type { MatchupPairing, TeamInfo } from '../types';

export class RoundRobinStrategy implements SchedulingStrategy {
  getName(): string {
    return 'round-robin';
  }

  generatePairings(teams: TeamInfo[], numberOfWeeks: number): MatchupPairing[] {
    if (teams.length < 2) {
      return []; // Need at least 2 teams
    }

    const pairings: MatchupPairing[] = [];
    const teamCount = teams.length;
    const isOdd = teamCount % 2 === 1;

    // For odd number of teams, add a dummy "bye" team
    const workingTeams = isOdd ? [...teams, null] : [...teams];
    const totalTeams = workingTeams.length;

    // Round-robin requires n-1 rounds for n teams (or n rounds for n+1 with bye)
    const totalRounds = totalTeams - 1;
    const matchesPerRound = Math.floor(totalTeams / 2);

    // Use circle method: fix one team, rotate others
    let currentWeek = 1;

    for (
      let round = 0;
      round < totalRounds && currentWeek <= numberOfWeeks;
      round++
    ) {
      // Generate pairings for this round
      for (let match = 0; match < matchesPerRound; match++) {
        let home: TeamInfo | null;
        let away: TeamInfo | null;

        if (match === 0) {
          // First match: fixed team vs last team in rotation
          home = workingTeams[0];
          away = workingTeams[totalTeams - 1];
        } else {
          // Other matches: pair teams symmetrically
          home = workingTeams[match];
          away = workingTeams[totalTeams - 1 - match];
        }

        // Skip if either team is null (bye week)
        if (home && away) {
          // Alternate home/away for fairness
          const isHomeSwapped = round % 2 === 1;
          pairings.push({
            team1Id: isHomeSwapped ? away.id : home.id,
            team2Id: isHomeSwapped ? home.id : away.id,
            weekNumber: currentWeek,
            gamesPerMatchup: 0, // Will be filled by scheduler
          });
        }
      }

      // Rotate teams (except the fixed first team)
      if (totalTeams > 2) {
        const removed = workingTeams.splice(totalTeams - 1, 1)[0];
        workingTeams.splice(1, 0, removed);
      }

      currentWeek++;
    }

    // If we have more weeks than needed for one full round-robin,
    // repeat the schedule or generate additional rounds
    if (currentWeek <= numberOfWeeks) {
      const remainingWeeks = numberOfWeeks - currentWeek + 1;
      const baseSchedule = [...pairings];

      // Pre-index base schedule by week number for O(1) lookup
      const basePairingsByWeek = new Map<number, MatchupPairing[]>();
      const baseKeysByWeek = new Map<number, Set<string>>();
      for (const p of baseSchedule) {
        let weekPairings = basePairingsByWeek.get(p.weekNumber);
        if (!weekPairings) {
          weekPairings = [];
          basePairingsByWeek.set(p.weekNumber, weekPairings);
        }
        weekPairings.push(p);

        let keys = baseKeysByWeek.get(p.weekNumber);
        if (!keys) {
          keys = new Set<string>();
          baseKeysByWeek.set(p.weekNumber, keys);
        }
        keys.add(
          p.team1Id < p.team2Id
            ? `${p.team1Id}-${p.team2Id}`
            : `${p.team2Id}-${p.team1Id}`,
        );
      }

      // Helper: normalize a pair to a sorted key
      const pairKey = (p: MatchupPairing): string =>
        p.team1Id < p.team2Id
          ? `${p.team1Id}-${p.team2Id}`
          : `${p.team2Id}-${p.team1Id}`;

      // Track the previous week's pair keys, carrying forward as we build
      let prevWeekKeys = new Set<string>();
      // Initialize from the last week of the base schedule
      for (const p of pairings) {
        if (p.weekNumber === currentWeek - 1) {
          prevWeekKeys.add(pairKey(p));
        }
      }

      // Track which cycle offset to use — start at 0, advance if
      // the chosen source week would duplicate the previous week's pairings.
      let cycleOffset = 0;

      for (let week = 0; week < remainingWeeks; week++) {
        // Try source weeks in order until we find one that doesn't
        // repeat the previous week's pairings (or exhaust all options).
        let sourceWeek = ((week + cycleOffset) % totalRounds) + 1;
        for (let attempt = 0; attempt < totalRounds - 1; attempt++) {
          const candidateKeys = baseKeysByWeek.get(sourceWeek);
          // Check overlap: if ANY pair from this source week was in the previous week, skip it
          let hasOverlap = false;
          if (candidateKeys) {
            for (const key of candidateKeys) {
              if (prevWeekKeys.has(key)) {
                hasOverlap = true;
                break;
              }
            }
          }
          if (!hasOverlap) break;
          cycleOffset++;
          sourceWeek = ((week + cycleOffset) % totalRounds) + 1;
        }

        const sourcePairings = basePairingsByWeek.get(sourceWeek) ?? [];

        // Determine whether to swap home/away based on how many times
        // this source week has been used (cycle number)
        const cycleNumber = Math.floor((week + cycleOffset) / totalRounds);
        const shouldSwap = cycleNumber % 2 === 0;

        // Build the current week's keys as we go (carry forward for next iteration)
        const currentWeekKeys = new Set<string>();
        for (const pairing of sourcePairings) {
          const newPairing: MatchupPairing = {
            ...pairing,
            weekNumber: currentWeek,
            team1Id: shouldSwap ? pairing.team2Id : pairing.team1Id,
            team2Id: shouldSwap ? pairing.team1Id : pairing.team2Id,
          };
          pairings.push(newPairing);
          currentWeekKeys.add(pairKey(newPairing));
        }

        prevWeekKeys = currentWeekKeys;
        currentWeek++;
      }
    }

    return pairings;
  }
}
