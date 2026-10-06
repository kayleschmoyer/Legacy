/**
 * Jest `setupFiles` entry: installs `mockDbClientModule` / `mockDrizzleOrm` as
 * globals so a hoisted `jest.mock` factory can reach them whatever the import
 * order. jest.helpers.cjs's createNodeJestConfig adds this to every project it
 * builds; a project with a hand-written jest config lists it itself (LS-10498).
 *
 * Loading this file costs nothing: the testkit only touches the real
 * db-client / drizzle-orm modules when a factory actually calls a helper.
 */
import { mockDbClientModule, mockDrizzleOrm } from './db-client-module.testkit';

// Object.assign, not `globalThis.x = ...`: this file is compiled in projects
// whose tsconfig doesn't include ./globals.d.ts.
Object.assign(globalThis, { mockDbClientModule, mockDrizzleOrm });
