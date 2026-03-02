/**
 * Divisional scheduling strategy
 *
 * Teams play division opponents more frequently than non-division opponents.
 * Typical split: 60% divisional games, 40% inter-divisional games.
 *
 * Assumes teams have a `divisionId` field.
 */

import type { SchedulingStrategy } from './strategy-interface';
import { shuffleArray } from './strategy-interface';
import type { MatchupPairing, TeamInfo } from '../types';

export interface DivisionalConfig {
  divisionalGamePercentage: number; // 0.0 to 1.0 (e.g., 0.6 for 60%)
}

export class DivisionalStrategy implements SchedulingStrategy {
  private config: DivisionalConfig;

  constructor(config: DivisionalConfig = { divisionalGamePercentage: 0.6 }) {
    this.config = config;
  }

  getName(): string {
    return 'divisional';
  }

  generatePairings(teams: TeamInfo[], numberOfWeeks: number): MatchupPairing[] {
    if (teams.length < 2) {
      return [];
    }

    // Group teams by division
    const divisions = new Map<number, TeamInfo[]>();
    for (const team of teams) {
      const divisionId = team.divisionId ?? 0; // Default division if not set
      if (!divisions.has(divisionId)) {
        divisions.set(divisionId, []);
      }
      const divisionTeams = divisions.get(divisionId);
      if (divisionTeams) {
        divisionTeams.push(team);
      }
    }

    // If only one division or no divisions set, fall back to round-robin-like
    if (divisions.size <= 1) {
      return this.generateRoundRobinFallback(teams, numberOfWeeks);
    }

    const pairings: MatchupPairing[] = [];
    const totalGames = Math.floor((teams.length / 2) * numberOfWeeks);
    const divisionalGames = Math.floor(
      totalGames * this.config.divisionalGamePercentage,
    );
    const interDivisionalGames = totalGames - divisionalGames;

    let divisionalGamesScheduled = 0;
    let interDivisionalGamesScheduled = 0;
    let currentWeek = 1;

    while (currentWeek <= numberOfWeeks) {
      const teamsAvailableThisWeek = new Set(teams.map((t) => t.id));

      // Bug fix 1: Schedule divisional games — pair ALL available teams within
      // each division (not just shuffled[0] vs shuffled[1]).
      if (divisionalGamesScheduled < divisionalGames) {
        for (const [, divTeams] of divisions) {
          if (divTeams.length < 2) continue;

          const availableInDiv = divTeams.filter((t) =>
            teamsAvailableThisWeek.has(t.id),
          );

          if (availableInDiv.length >= 2) {
            const shuffled = shuffleArray(availableInDiv);

            for (let i = 0; i + 1 < shuffled.length; i += 2) {
              const team1 = shuffled[i];
              const team2 = shuffled[i + 1];

              pairings.push({
                team1Id: team1.id,
                team2Id: team2.id,
                weekNumber: currentWeek,
                gamesPerMatchup: 0,
              });

              teamsAvailableThisWeek.delete(team1.id);
              teamsAvailableThisWeek.delete(team2.id);
              divisionalGamesScheduled++;

              if (divisionalGamesScheduled >= divisionalGames) break;
            }
          }

          if (divisionalGamesScheduled >= divisionalGames) break;
        }
      }

      // Bug fix 2: Schedule inter-divisional games for remaining teams.
      // Instead of skipping same-division consecutive pairs, actively seek a
      // cross-division partner and fall back to any available partner.
      if (interDivisionalGamesScheduled < interDivisionalGames) {
        const available = shuffleArray(
          teams.filter((t) => teamsAvailableThisWeek.has(t.id)),
        );

        while (available.length >= 2) {
          const team1 = available.shift()!;

          // Prefer a partner from a different division
          const crossDivIdx = available.findIndex(
            (t) => t.divisionId !== team1.divisionId,
          );
          const partnerIdx = crossDivIdx !== -1 ? crossDivIdx : 0;
          const [team2] = available.splice(partnerIdx, 1);

          pairings.push({
            team1Id: team1.id,
            team2Id: team2.id,
            weekNumber: currentWeek,
            gamesPerMatchup: 0,
          });

          teamsAvailableThisWeek.delete(team1.id);
          teamsAvailableThisWeek.delete(team2.id);
          interDivisionalGamesScheduled++;

          if (interDivisionalGamesScheduled >= interDivisionalGames) break;
        }
      }

      currentWeek++;
    }

    return pairings;
  }

  private generateRoundRobinFallback(
    teams: TeamInfo[],
    numberOfWeeks: number,
  ): MatchupPairing[] {
    const pairings: MatchupPairing[] = [];
    let week = 1;

    while (week <= numberOfWeeks) {
      const shuffled = shuffleArray([...teams]);

      for (let i = 0; i < shuffled.length - 1; i += 2) {
        pairings.push({
          team1Id: shuffled[i].id,
          team2Id: shuffled[i + 1].id,
          weekNumber: week,
          gamesPerMatchup: 0,
        });
      }

      week++;
    }

    return pairings;
  }
}
