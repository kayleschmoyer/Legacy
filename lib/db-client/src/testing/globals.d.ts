/**
 * Types for the globals ./setup.ts installs. A project whose specs call them
 * lists this file in its tsconfig.spec.json `include` (LS-10498).
 */
import type { DbClientModuleOverrides } from './db-client-module.testkit';

type DbClientModule = typeof import('@legacy-sports/db-client');
type DrizzleOrmModule = typeof import('drizzle-orm');

declare global {
  var mockDbClientModule: (
    overrides?: DbClientModuleOverrides,
  ) => DbClientModule;
  var mockDrizzleOrm: (overrides?: {
    [K in keyof DrizzleOrmModule]?: unknown;
  }) => DrizzleOrmModule;
}
