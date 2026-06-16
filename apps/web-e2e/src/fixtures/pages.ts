import { type Page } from '@playwright/test';

import {
  adminTest as authAdminTest,
  test as authTest,
  unauthTest as authUnauthTest,
  createCustomAuthTest,
  expect,
} from './auth-enhanced';
import { test as leagueDataBase } from './auth';
import { DraftPage, LeaguePage, PlayersPage } from '../pages';
import { NavHeader } from '../components';

/**
 * Page-object injection layer (ADR-0015 §5).
 *
 * Specs never call `new` on a page object — they receive ready-made instances
 * as fixtures. Page objects compose ON TOP of an auth base so a spec keeps the
 * exact auth/identity/mock layer it needs and only adds the page objects:
 *
 *   • `test`        — default authenticated, isolated (= `auth-enhanced` test)
 *   • `leagueTest`  — authenticated + league-data overrides (= `auth` test)
 *   • `adminTest`   — admin identity
 *   • `unauthTest`  — unauthenticated
 *   • `customAuthTest(email, level)` — a one-off identity (e.g. a free-tier user)
 *
 * Identity stays a fixture dimension (ADR-0015 §3); the page objects are
 * identical across every variant. Page objects carry no mocking or data setup —
 * that stays in fixtures and route handlers (ADR-0015 §6).
 */
export interface PageObjectFixtures {
  draftPage: DraftPage;
  leaguePage: LeaguePage;
  playersPage: PlayersPage;
  /**
   * The persistent header / nav bar. A component (not a page object) composed
   * here scoped to the `banner` landmark — present on every authenticated
   * route (ADR-0015 §2).
   */
  navHeader: NavHeader;
}

/**
 * Per-test fixture definitions. Each instantiates one page object bound to the
 * test's `page`. Shared across every identity variant so admin / unauth /
 * custom specs receive the same page objects.
 */
const pageObjects = {
  draftPage: async (
    { page }: { page: Page },
    use: (pageObject: DraftPage) => Promise<void>,
  ) => {
    await use(new DraftPage(page));
  },
  leaguePage: async (
    { page }: { page: Page },
    use: (pageObject: LeaguePage) => Promise<void>,
  ) => {
    await use(new LeaguePage(page));
  },
  playersPage: async (
    { page }: { page: Page },
    use: (pageObject: PlayersPage) => Promise<void>,
  ) => {
    await use(new PlayersPage(page));
  },
  navHeader: async (
    { page }: { page: Page },
    use: (component: NavHeader) => Promise<void>,
  ) => {
    await use(new NavHeader(page.getByRole('banner')));
  },
};

/**
 * Default authenticated test with page objects injected. Drop-in replacement
 * for the `test` exported from `auth-enhanced` — same isolation, now with
 * `{ draftPage, leaguePage, playersPage, navHeader }`.
 */
export const test = authTest.extend<PageObjectFixtures>(pageObjects);

/**
 * Authenticated league-data test with page objects injected. Drop-in
 * replacement for the `test` exported from `auth` — same OAuth + GetUserLeagues
 * / GetLeagueById overrides, now with the page objects.
 */
export const leagueTest =
  leagueDataBase.extend<PageObjectFixtures>(pageObjects);

/** Admin-identity test with page objects injected. */
export const adminTest = authAdminTest.extend<PageObjectFixtures>(pageObjects);

/** Unauthenticated test with page objects injected. */
export const unauthTest =
  authUnauthTest.extend<PageObjectFixtures>(pageObjects);

/**
 * A one-off identity test with page objects injected — wraps
 * `createCustomAuthTest` so specs needing a specific user (e.g. a free-tier
 * account) still receive `{ leaguePage, … }` without calling `new`.
 */
export function customAuthTest(
  email: string,
  accessLevel: 'none' | 'admin' = 'none',
) {
  return createCustomAuthTest(email, accessLevel).extend<PageObjectFixtures>(
    pageObjects,
  );
}

export { expect };
