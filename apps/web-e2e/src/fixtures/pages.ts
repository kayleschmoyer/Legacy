import { type Page } from '@playwright/test';

import {
  adminTest as authAdminTest,
  test as authTest,
  unauthTest as authUnauthTest,
  expect,
} from './auth-enhanced';
import { DraftPage, LeaguePage, PlayersPage } from '../pages';
import { NavHeader } from '../components';

/**
 * Page-object injection layer (ADR-0015 §5).
 *
 * Composes ON TOP of the `auth-enhanced` fixtures so specs receive ready-made
 * page objects and never call `new`. This preserves everything auth-enhanced
 * provides — the `_apiIsolation` and `_coverage` auto-fixtures and the identity
 * variants (`test` / `adminTest` / `unauthTest`) — and only adds the page
 * objects on top.
 *
 * Identity stays a fixture dimension (ADR-0015 §3): pick `adminTest` /
 * `unauthTest` for a different identity; the page objects are unchanged. Page
 * objects carry no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6).
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
 * test's `page`. Shared across all identity variants below so admin / unauth
 * specs receive the same page objects.
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

/** Admin-identity test with page objects injected. */
export const adminTest = authAdminTest.extend<PageObjectFixtures>(pageObjects);

/** Unauthenticated test with page objects injected. */
export const unauthTest =
  authUnauthTest.extend<PageObjectFixtures>(pageObjects);

export { expect };
