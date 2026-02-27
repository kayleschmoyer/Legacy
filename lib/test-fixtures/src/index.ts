/**
 * @legacy-sports/test-fixtures
 *
 * Reusable test fixtures, factory functions, and helpers for use across
 * all test suites in the monorepo.
 *
 * ## Quick start
 *
 * ### Static fixtures (pre-built data)
 * ```ts
 * import { fixtures, getPlayer, getLeague } from '@legacy-sports/test-fixtures';
 *
 * const player = fixtures.players[0]; // Mike Trout (frozen — do not mutate)
 * const playerCopy = getPlayer(0);    // fresh mutable copy
 * ```
 *
 * ### Factories (build test objects with overrides)
 * ```ts
 * import { createPlayer, createLeague } from '@legacy-sports/test-fixtures';
 *
 * const player = createPlayer({ firstName: 'Custom' });
 * const league = createLeague({ id: 99, inviteCode: 'UNIQUE99' });
 * ```
 *
 * ### Searching fixtures
 * ```ts
 * import { findFixture } from '@legacy-sports/test-fixtures';
 *
 * const admin = findFixture('users', (u) => u.accessLevel === 'admin');
 * ```
 */

export * from './lib/types';
export * from './lib/data';
export * from './lib/factories';
export * from './lib/helpers';
