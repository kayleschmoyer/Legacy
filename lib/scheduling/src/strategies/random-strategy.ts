/**
 * Random scheduling strategy
 *
 * Generates random matchups each week while ensuring:
 * - No duplicate pairings within the same week
 * - Each team plays only once per week
 * - Balanced home/away distribution
 */

import type { SchedulingStrategy } from './strategy-interface';
import { shuffleArray } from './strategy-interface';
import type { MatchupPairing, TeamInfo } from '../types';

export class RandomStrategy implements SchedulingStrategy {
  getName(): string {
    return 'random';
  }

  generatePairings(teams: TeamInfo[], numberOfWeeks: number): MatchupPairing[] {
    if (teams.length < 2) {
      return [];
    }

    const pairings: MatchupPairing[] = [];

    // Track home/away balance for each team
    const homeCount = new Map<number, number>();
    teams.forEach((team) => homeCount.set(team.id, 0));

    for (let week = 1; week <= numberOfWeeks; week++) {
      // Shuffle teams for randomness
      const shuffledTeams = shuffleArray([...teams]);
      const weekPairings: MatchupPairing[] = [];

      // Pair teams sequentially from shuffled list
      for (let i = 0; i < shuffledTeams.length - 1; i += 2) {
        const team1 = shuffledTeams[i];
        const team2 = shuffledTeams[i + 1];

        // Determine home/away based on balance
        const team1HomeCount = homeCount.get(team1.id) ?? 0;
        const team2HomeCount = homeCount.get(team2.id) ?? 0;

        let homeTeam: TeamInfo;
        let awayTeam: TeamInfo;

        if (team1HomeCount < team2HomeCount) {
          homeTeam = team1;
          awayTeam = team2;
        } else if (team2HomeCount < team1HomeCount) {
          homeTeam = team2;
          awayTeam = team1;
        } else {
          // Equal counts - random choice
          if (Math.random() < 0.5) {
            homeTeam = team1;
            awayTeam = team2;
          } else {
            homeTeam = team2;
            awayTeam = team1;
          }
        }

        weekPairings.push({
          team1Id: homeTeam.id,
          team2Id: awayTeam.id,
          weekNumber: week,
          gamesPerMatchup: 0, // Will be filled by scheduler
        });

        // Update home count
        homeCount.set(homeTeam.id, (homeCount.get(homeTeam.id) ?? 0) + 1);
      }

      // If odd number of teams, one team has a bye
      // (Already handled by not pairing the last team in shuffled list)

      pairings.push(...weekPairings);
    }

    return pairings;
  }
}
