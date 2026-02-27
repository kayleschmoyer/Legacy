/**
 * Test Fixtures — Reusable test data for integration tests.
 *
 * This module re-exports the shared `@legacy-sports/test-fixtures` library.
 * Existing imports from `../__fixtures__` continue to work unchanged.
 *
 * For new code, import directly from the shared library:
 *   import { createPlayer, getLeague } from '@legacy-sports/test-fixtures';
 */

export * from '@legacy-sports/test-fixtures';

// Backward-compatible alias for code that referenced the old type name.
export type { FixtureCareerStats as FixtureCareerStatsCollection } from '@legacy-sports/test-fixtures';
