import { type Page } from '@playwright/test';

import {
  adminTest as authAdminTest,
  test as authTest,
  unauthTest as authUnauthTest,
  createCustomAuthTest,
  expect,
} from './auth-enhanced';
import { test as leagueDataBase } from './auth';
import {
  AnalyticsPage,
  DiscordCallbackScreen,
  DraftPage,
  FootballPlayersComparePage,
  ForgotPasswordPage,
  FreeAgentsPage,
  LeaguePage,
  MatchupPage,
  NotificationsPage,
  PlayersPage,
  ProfileSettingsScreen,
  RedirectResolverPage,
  ResetPasswordPage,
  RosterPage,
  SettingsPage,
  StandingsPage,
  SubscriptionScreen,
  TradesPage,
  WaiversPage,
} from '../pages';
import { NavHeader } from '../components';
import { PlaywrightWebDriver } from '../driver';

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
  analyticsPage: AnalyticsPage;
  draftPage: DraftPage;
  /** The football player-comparison route (`/football/players/compare`). */
  footballComparePage: FootballPlayersComparePage;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  leaguePage: LeaguePage;
  playersPage: PlayersPage;
  /** The league Standings tab surface (`/…/league/:id/standings`). */
  standingsPage: StandingsPage;
  /** The league Roster tab surface (`/…/league/:id/roster`). */
  rosterPage: RosterPage;
  /** The matchup detail page (`/…/league/:id/matchups/:matchupId`). */
  matchupPage: MatchupPage;
  /** The Discord OAuth callback screen (/auth/discord/callback). */
  discordCallbackScreen: DiscordCallbackScreen;
  /** The Profile Settings screen (/profile/settings) — Discord-callback landing + 2FA section. */
  profileSettingsScreen: ProfileSettingsScreen;
  /**
   * The resolver / redirect + legacy-alias routes (ADR-0016 driver-typed).
   * Drives /matchup/:id, /standings, and legacy aliases (LS-8464).
   */
  redirectPage: RedirectResolverPage;
  /** Trades tab (`/:sport/league/:id/trades`) — trading center, propose-trade, trade block. */
  tradesPage: TradesPage;
  /** Pending waiver claims (rendered on the roster tab). */
  waiversPage: WaiversPage;
  /** Free-agents tab (`/:sport/league/:id/free-agents`). */
  freeAgentsPage: FreeAgentsPage;
  /** Notifications route (`/notifications`) + nav-bell dropdown. */
  notificationsPage: NotificationsPage;
  /** Preferences (`/preferences`) + profile settings (`/profile/settings`). */
  settingsPage: SettingsPage;
  /**
   * The persistent header / nav bar. A component (not a page object) composed
   * here scoped to the `banner` landmark — present on every authenticated
   * route (ADR-0015 §2).
   */
  navHeader: NavHeader;
  /** Subscription screen — exposes the billing action + step-up challenge. */
  subscriptionScreen: SubscriptionScreen;
}

/**
 * Per-test fixture definitions. Each instantiates one page object bound to the
 * test's `page`. Shared across every identity variant so admin / unauth /
 * custom specs receive the same page objects.
 */
const pageObjects = {
  analyticsPage: async (
    { page }: { page: Page },
    use: (pageObject: AnalyticsPage) => Promise<void>,
  ) => {
    await use(new AnalyticsPage(new PlaywrightWebDriver(page)));
  },
  draftPage: async (
    { page }: { page: Page },
    use: (pageObject: DraftPage) => Promise<void>,
  ) => {
    // DraftPage is migrated to the platform-neutral driver (ADR-0016); on web
    // it is constructed with the Playwright driver adapter. Unmigrated page
    // objects below still take the raw `page`.
    await use(new DraftPage(new PlaywrightWebDriver(page)));
  },
  footballComparePage: async (
    { page }: { page: Page },
    use: (pageObject: FootballPlayersComparePage) => Promise<void>,
  ) => {
    await use(new FootballPlayersComparePage(new PlaywrightWebDriver(page)));
  },
  forgotPasswordPage: async (
    { page }: { page: Page },
    use: (pageObject: ForgotPasswordPage) => Promise<void>,
  ) => {
    await use(new ForgotPasswordPage(new PlaywrightWebDriver(page)));
  },
  resetPasswordPage: async (
    { page }: { page: Page },
    use: (pageObject: ResetPasswordPage) => Promise<void>,
  ) => {
    await use(new ResetPasswordPage(new PlaywrightWebDriver(page)));
  },
  leaguePage: async (
    { page }: { page: Page },
    use: (pageObject: LeaguePage) => Promise<void>,
  ) => {
    await use(new LeaguePage(new PlaywrightWebDriver(page)));
  },
  playersPage: async (
    { page }: { page: Page },
    use: (pageObject: PlayersPage) => Promise<void>,
  ) => {
    await use(new PlayersPage(new PlaywrightWebDriver(page)));
  },
  standingsPage: async (
    { page }: { page: Page },
    use: (pageObject: StandingsPage) => Promise<void>,
  ) => {
    await use(new StandingsPage(new PlaywrightWebDriver(page)));
  },
  rosterPage: async (
    { page }: { page: Page },
    use: (pageObject: RosterPage) => Promise<void>,
  ) => {
    await use(new RosterPage(new PlaywrightWebDriver(page)));
  },
  matchupPage: async (
    { page }: { page: Page },
    use: (pageObject: MatchupPage) => Promise<void>,
  ) => {
    await use(new MatchupPage(new PlaywrightWebDriver(page)));
  },
  discordCallbackScreen: async (
    { page }: { page: Page },
    use: (pageObject: DiscordCallbackScreen) => Promise<void>,
  ) => {
    await use(new DiscordCallbackScreen(new PlaywrightWebDriver(page)));
  },
  profileSettingsScreen: async (
    { page }: { page: Page },
    use: (pageObject: ProfileSettingsScreen) => Promise<void>,
  ) => {
    await use(new ProfileSettingsScreen(new PlaywrightWebDriver(page)));
  },
  redirectPage: async (
    { page }: { page: Page },
    use: (pageObject: RedirectResolverPage) => Promise<void>,
  ) => {
    await use(new RedirectResolverPage(new PlaywrightWebDriver(page)));
  },
  tradesPage: async (
    { page }: { page: Page },
    use: (pageObject: TradesPage) => Promise<void>,
  ) => {
    await use(new TradesPage(new PlaywrightWebDriver(page)));
  },
  waiversPage: async (
    { page }: { page: Page },
    use: (pageObject: WaiversPage) => Promise<void>,
  ) => {
    await use(new WaiversPage(new PlaywrightWebDriver(page)));
  },
  freeAgentsPage: async (
    { page }: { page: Page },
    use: (pageObject: FreeAgentsPage) => Promise<void>,
  ) => {
    await use(new FreeAgentsPage(new PlaywrightWebDriver(page)));
  },
  notificationsPage: async (
    { page }: { page: Page },
    use: (pageObject: NotificationsPage) => Promise<void>,
  ) => {
    await use(new NotificationsPage(new PlaywrightWebDriver(page)));
  },
  settingsPage: async (
    { page }: { page: Page },
    use: (pageObject: SettingsPage) => Promise<void>,
  ) => {
    await use(new SettingsPage(new PlaywrightWebDriver(page)));
  },
  navHeader: async (
    { page }: { page: Page },
    use: (component: NavHeader) => Promise<void>,
  ) => {
    await use(new NavHeader(page.getByRole('banner')));
  },
  subscriptionScreen: async (
    { page }: { page: Page },
    use: (pageObject: SubscriptionScreen) => Promise<void>,
  ) => {
    await use(new SubscriptionScreen(new PlaywrightWebDriver(page)));
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
