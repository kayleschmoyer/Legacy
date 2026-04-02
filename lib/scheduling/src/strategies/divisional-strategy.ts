/**
 * Divisional scheduling strategy
 *
 * Teams play division opponents more frequently than non-division opponents.
 * Typical split: 60% divisional games, 40% inter-divisional games.
 *
 * Assumes teams have a `divisionId` field.
 *
 * Odd-team support: when the total number of teams is odd, exactly one team
 * receives a bye each week.  The bye rotates deterministically across all
 * teams (sorted by ID) so bye counts are distributed as evenly as possible
 * (counts differ by at most 1 when `numberOfWeeks` is not a multiple of
 * `teams.length`).  Leagues with an odd team count must use an odd number of
 * divisions (enforced by the mutation layer) so that division sizes stay as
 * symmetric as possible.
 */

import { shuffleArray } from '@legacy-sports/utils';
import type { SchedulingStrategy } from './strategy-interface';
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

    const isOdd = teams.length % 2 === 1;
    // Sort by ID once for stable, predictable bye rotation across the season.
    const sortedTeams = isOdd ? [...teams].sort((a, b) => a.id - b.id) : teams;

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
    // For odd teams, floor(N/2) active games per week (one team has a bye).
    const totalGames = Math.floor((teams.length / 2) * numberOfWeeks);
    const divisionalGames = Math.floor(
      totalGames * this.config.divisionalGamePercentage,
    );
    const interDivisionalGames = totalGames - divisionalGames;

    let divisionalGamesScheduled = 0;
    let interDivisionalGamesScheduled = 0;
    let currentWeek = 1;

    while (currentWeek <= numberOfWeeks) {
      // For odd-team leagues, rotate the bye team deterministically by week.
      // The team at index (week-1) % N (sorted by ID) sits out this week.
      const byeTeamId = isOdd
        ? sortedTeams[(currentWeek - 1) % sortedTeams.length].id
        : null;

      const teamsAvailableThisWeek = new Set(
        teams.filter((t) => t.id !== byeTeamId).map((t) => t.id),
      );

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
          const team1 = available.shift();
          if (!team1) break; // guard: while condition ensures this won't trigger

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
    const isOdd = teams.length % 2 === 1;
    // Sort by ID for stable, predictable bye rotation.
    const sortedTeams = isOdd ? [...teams].sort((a, b) => a.id - b.id) : teams;
    let week = 1;

    while (week <= numberOfWeeks) {
      // For odd-team leagues, rotate the bye team so bye counts differ by at most 1
      // across all teams (exactly equal only when numberOfWeeks is a multiple of teams.length).
      const byeTeamId = isOdd
        ? sortedTeams[(week - 1) % sortedTeams.length].id
        : null;

      const active = shuffleArray(teams.filter((t) => t.id !== byeTeamId));

      for (let i = 0; i < active.length - 1; i += 2) {
        pairings.push({
          team1Id: active[i].id,
          team2Id: active[i + 1].id,
          weekNumber: week,
          gamesPerMatchup: 0,
        });
      }

      week++;
    }

    return pairings;
  }
}
