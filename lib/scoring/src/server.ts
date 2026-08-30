/**
 * Server-only entry point for `@legacy-sports/scoring`.
 *
 * Everything exported here reaches for `@legacy-sports/db-client`'s query
 * helpers, which are Node-only. Keeping them off the package's main entry is
 * what stops that Node-only config from being pulled into the web and mobile
 * bundles (LS-9041). Import from `@legacy-sports/scoring/server` in lambdas
 * and scripts; import from `@legacy-sports/scoring` everywhere else.
 */

export * from './server/football-scoring-settings';
