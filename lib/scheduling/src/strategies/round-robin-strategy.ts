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

      for (let week = 0; week < remainingWeeks; week++) {
        // Cycle through weeks 1..totalRounds (totalRounds = one full round-robin cycle).
        // Using baseSchedule.length here was a bug: that value is
        // totalRounds * matchesPerRound, so it overshot and produced empty
        // weeks once week > totalRounds.
        const sourceWeek = (week % totalRounds) + 1;
        const sourcePairings = baseSchedule.filter(
          (p) => p.weekNumber === sourceWeek,
        );

        for (const pairing of sourcePairings) {
          pairings.push({
            ...pairing,
            weekNumber: currentWeek,
            // Swap home/away in repeated rounds for fairness
            team1Id: pairing.team2Id,
            team2Id: pairing.team1Id,
          });
        }

        currentWeek++;
      }
    }

    return pairings;
  }
}
