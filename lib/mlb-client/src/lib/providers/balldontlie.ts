/**
 * BALLDONTLIE provider — skeleton implementation.
 *
 * Throws NotImplementedError for all methods until we integrate the
 * licensed paid provider. Accepts an API key in the constructor to
 * document the interface contract.
 *
 * Replace method bodies with real API calls when the paid license is acquired.
 */
import type { MlbDataProvider } from '../provider';
import type {
  GameFeed,
  PlayerGameStats,
  PlayerSeasonStats,
  Schedule,
  ScheduleOptions,
  Scoreboard,
  Standings,
  Team,
} from '../types';

export class BallDontLieProvider implements MlbDataProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('[balldontlie] MLB_DATA_API_KEY is required');
    }
  }

  getScoreboard(_date: string): Promise<Scoreboard> {
    throw new NotImplementedError('getScoreboard');
  }

  getGameFeed(_gamePk: number): Promise<GameFeed> {
    throw new NotImplementedError('getGameFeed');
  }

  getPlayerStats(
    _mlbPlayerId: number,
    _season: number,
    _group: 'hitting' | 'pitching' | 'fielding',
  ): Promise<PlayerSeasonStats> {
    throw new NotImplementedError('getPlayerStats');
  }

  getPlayerGameStats(
    _mlbPlayerId: number,
    _gamePk: number,
  ): Promise<PlayerGameStats> {
    throw new NotImplementedError('getPlayerGameStats');
  }

  getSchedule(_date: string, _options?: ScheduleOptions): Promise<Schedule> {
    throw new NotImplementedError('getSchedule');
  }

  getStandings(_season: number): Promise<Standings> {
    throw new NotImplementedError('getStandings');
  }

  getTeams(): Promise<Team[]> {
    throw new NotImplementedError('getTeams');
  }
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `[balldontlie] ${method} is not yet implemented. ` +
        'Acquire and configure the paid MLB data license to enable this provider.',
    );
    this.name = 'NotImplementedError';
  }
}
