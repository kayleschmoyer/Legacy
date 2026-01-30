/**
 * Test Fixtures - Reusable test data for integration tests
 *
 * Usage:
 *   import { fixtures } from '../__fixtures__';
 *   const player = fixtures.players[0];
 *   const league = fixtures.leagues.find(l => l.name === 'Test League Alpha');
 */

import type {
  FixtureCareerStats,
  FixtureCareerStatsCollection,
  FixtureLeague,
  FixtureMatchup,
  FixturePlayer,
  FixtureTeam,
  FixtureUser,
} from './types';

import playersData from './players.json';
import usersData from './users.json';
import leaguesData from './leagues.json';
import teamsData from './teams.json';
import matchupsData from './matchups.json';
import careerStatsData from './careerStats.json';

export * from './types';

export const fixtures = {
  players: playersData as FixturePlayer[],
  users: usersData as FixtureUser[],
  leagues: leaguesData as FixtureLeague[],
  teams: teamsData as FixtureTeam[],
  matchups: matchupsData as FixtureMatchup[],
  careerStats: careerStatsData as FixtureCareerStatsCollection,
};

/**
 * Helper function to get a fresh copy of a fixture (prevents mutation)
 */
export function getFixture<T>(
  fixtureName: keyof typeof fixtures,
  index = 0,
): T {
  const fixtureArray = fixtures[fixtureName];
  if (Array.isArray(fixtureArray)) {
    return JSON.parse(JSON.stringify(fixtureArray[index])) as T;
  }
  return JSON.parse(JSON.stringify(fixtureArray)) as T;
}

/**
 * Helper to find a fixture by property
 */
export function findFixture<T>(
  fixtureName: keyof typeof fixtures,
  predicate: (item: any) => boolean,
): T | undefined {
  const fixtureArray = fixtures[fixtureName];
  if (Array.isArray(fixtureArray)) {
    const found = fixtureArray.find(predicate);
    return found ? JSON.parse(JSON.stringify(found)) : undefined;
  }
  return undefined;
}

// Type-safe fixture getters
export const getPlayer = (index = 0) =>
  getFixture<(typeof playersData)[0]>('players', index);
export const getUser = (index = 0) =>
  getFixture<(typeof usersData)[0]>('users', index);
export const getLeague = (index = 0) =>
  getFixture<(typeof leaguesData)[0]>('leagues', index);
export const getTeam = (index = 0) =>
  getFixture<(typeof teamsData)[0]>('teams', index);
export const getMatchup = (index = 0) =>
  getFixture<(typeof matchupsData)[0]>('matchups', index);
