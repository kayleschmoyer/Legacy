/**
 * Utility helpers for working with fixture collections.
 *
 * These helpers always return **deep-cloned copies** so that mutations inside
 * a test don't bleed across test cases.
 */

import { fixtures } from './data';
import type {
  FixtureFootballPlayer,
  FixtureLeague,
  FixtureMatchup,
  FixturePlayer,
  FixtureTeam,
  FixtureUser,
} from './types';

/**
 * Explicit map from fixture collection key → item type.
 * Used to give `getFixture` and `findFixture` proper type inference.
 */
export interface FixtureItemMap {
  players: FixturePlayer;
  users: FixtureUser;
  leagues: FixtureLeague;
  teams: FixtureTeam;
  matchups: FixtureMatchup;
  footballPlayers: FixtureFootballPlayer;
}

/**
 * Return a deep-cloned item from a fixture array by index.
 *
 * @example
 * const player = getFixture('players', 0); // Mike Trout — mutable copy
 */
export function getFixture<K extends keyof FixtureItemMap>(
  fixtureName: K,
  index = 0,
): FixtureItemMap[K] {
  const arr = fixtures[fixtureName] as readonly FixtureItemMap[K][];
  return JSON.parse(JSON.stringify(arr[index])) as FixtureItemMap[K];
}

/**
 * Search a fixture array by predicate and return a deep-cloned match.
 * Returns `undefined` when no item matches.
 *
 * @example
 * const admin = findFixture('users', (u) => u.accessLevel === 'admin');
 */
export function findFixture<K extends keyof FixtureItemMap>(
  fixtureName: K,
  predicate: (item: FixtureItemMap[K]) => boolean,
): FixtureItemMap[K] | undefined {
  const arr = fixtures[fixtureName] as readonly FixtureItemMap[K][];
  const found = arr.find(predicate);
  return found === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(found)) as FixtureItemMap[K]);
}

// --------------------------------------------------------------------------
// Typed convenience getters (return fresh copies)
// --------------------------------------------------------------------------

/** Return a fresh mutable copy of fixture player at the given index. */
export const getPlayer = (index = 0): FixturePlayer =>
  getFixture('players', index);

/** Return a fresh mutable copy of fixture user at the given index. */
export const getUser = (index = 0): FixtureUser => getFixture('users', index);

/** Return a fresh mutable copy of fixture league at the given index. */
export const getLeague = (index = 0): FixtureLeague =>
  getFixture('leagues', index);

/** Return a fresh mutable copy of fixture team at the given index. */
export const getTeam = (index = 0): FixtureTeam => getFixture('teams', index);

/** Return a fresh mutable copy of fixture matchup at the given index. */
export const getMatchup = (index = 0): FixtureMatchup =>
  getFixture('matchups', index);

/** Return a fresh mutable copy of fixture football player at the given index. */
export const getFootballPlayer = (index = 0): FixtureFootballPlayer =>
  getFixture('footballPlayers', index);
