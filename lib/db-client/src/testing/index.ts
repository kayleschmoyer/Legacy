/**
 * `@legacy-sports/db-client/testing` — jest-only helpers for specs that mock
 * `@legacy-sports/db-client` or `drizzle-orm`. Never import this from
 * production code: it calls `jest.requireActual` and `expect.getState()`.
 */
export {
  mockDbClientModule,
  mockDrizzleOrm,
  type DbClientModuleOverrides,
} from './db-client-module.testkit';
