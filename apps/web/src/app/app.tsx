import React, { Suspense, useEffect, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Paragraph,
  UnifiedLoadingPanel,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { NavBar, type NavLink } from '@legacy-sports/shared-components';
import { styled, Text } from 'tamagui';
import { Menu } from '@tamagui/lucide-icons/icons/Menu';
import { useThemeContext } from '../context/ThemeContext';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { prefetchHomePage } from '../utils/prefetchHomePage';
import { PlayersStatsRedirectPage } from '../pages/players/PlayersStatsRedirectPage';
import { LegacyJoinRedirect } from '../pages/join/LegacyJoinRedirect';
import { CatchAllRoute } from '../pages/not-found/NotFoundPage';
import { UserProfileDropdown } from '../components/layout/UserProfileDropdown';
import { BugReportButton } from '../components/layout/BugReportButton';
import {
  NotificationDropdown,
  NotificationRealtimeSync,
} from '../components/layout/NotificationDropdown';
import { LeagueSwitcherChip } from '../components/layout/LeagueSwitcherChip';
import { HelpMenuButton } from '../components/layout/HelpMenuButton';
import { MobileBottomBar } from '../components/layout/MobileBottomBar';
import { MobileNavDrawer } from '../components/layout/MobileNavDrawer';
import { GlobalAnnouncer } from '../components/a11y/GlobalAnnouncer';
import { usePageTracking } from '../hooks/usePageTracking';
import { useRouteAnnouncer } from '../hooks/useRouteAnnouncer';
import { useAnalyticsIdentify } from '../hooks/useAnalyticsIdentify';
import { useWebPushRegistration } from '../hooks/useWebPushRegistration';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import { PostLoginBillingBanner } from '../components/PostLoginBillingBanner';
import { ApolloErrorToast } from '../components/layout/ApolloErrorToast';
import { SuccessToast } from '../components/layout/SuccessToast';
import { ScoreboardTicker } from '../components/scoreboard/ScoreboardTicker';
import { NAV_Z_INDEX } from '../constants/dimensions';
import { useFeatureValue } from '../context/GrowthBookProvider';
import { useIsPremiumStatus } from '../hooks/useIsPremium';
import { trackFeatureGateBlocked } from '../utils/analytics';
import {
  makeScrollPositionSaver,
  scrollPositionKey,
} from '../lib/user-scoped-storage';

/* ────────────────────────────────────────────────────────
 * Lazy-loaded routes — these pages are split into separate
 * chunks and only downloaded when the user navigates to them.
 * ──────────────────────────────────────────────────────── */
const HomePage = lazyWithRetry(() => import('../pages/home/HomePage'));
const BaseballScreen = lazyWithRetry(() =>
  import('../components/baseball').then((m) => ({
    default: m.BaseballScreen,
  })),
);
const PlayerStatsPage = lazyWithRetry(() =>
  import('../pages/players/PlayerStatsPage').then((m) => ({
    default: m.PlayerStatsRoute,
  })),
);
const PlayerDetailPage = lazyWithRetry(() =>
  import('../pages/players/PlayerStatsPage').then((m) => ({
    default: m.PlayerDetailPage,
  })),
);
const PlayerComparisonPage = lazyWithRetry(() =>
  import('../pages/players/PlayerComparisonPage').then((m) => ({
    default: m.PlayerComparisonPage,
  })),
);
const ViewGameLogsPage = lazyWithRetry(() =>
  import('../pages/players/ViewGameLogsPage').then((m) => ({
    default: m.ViewGameLogsPage,
  })),
);
const LeagueCreatePage = lazyWithRetry(
  () => import('../pages/baseball/LeagueCreatePage'),
);
const CreateLeagueWizardPage = lazyWithRetry(() =>
  import('../components/leagues/CreateLeagueWizard').then((m) => ({
    default: m.CreateLeagueWizard,
  })),
);
const LeagueDetailPage = lazyWithRetry(
  () => import('../pages/baseball/league-detail-v2/LeagueDetailPageV2'),
);
const TeamDetailPage = lazyWithRetry(() =>
  import('../pages/baseball/TeamDetailPage').then((m) => ({
    default: m.TeamDetailPage,
  })),
);
const JoinLeagueByCodePage = lazyWithRetry(
  () => import('../pages/baseball/JoinLeagueByCodePage'),
);
const LeagueDiscoveryPage = lazyWithRetry(() =>
  import('../pages/baseball/LeagueDiscoveryPage').then((m) => ({
    default: m.LeagueDiscoveryPage,
  })),
);
const MatchupDetailPage = lazyWithRetry(() =>
  import('../pages/matchup/MatchupDetailPage').then((m) => ({
    default: m.MatchupDetailPage,
  })),
);
const MatchupRedirectPage = lazyWithRetry(() =>
  import('../pages/matchup/MatchupRedirectPage').then((m) => ({
    default: m.MatchupRedirectPage,
  })),
);
const ManagementPage = lazyWithRetry(
  () => import('../pages/management/ManagementPage'),
);
const AboutPage = lazyWithRetry(() => import('../pages/about/AboutPage'));
const HelpPage = lazyWithRetry(() => import('../pages/help/HelpPage'));
const PricingPage = lazyWithRetry(() => import('../pages/pricing/PricingPage'));
const MockDraftPage = lazyWithRetry(() =>
  import('../pages/draft/MockDraftPage').then((m) => ({
    default: m.MockDraftPage,
  })),
);

// The mock draft room (LS-10076) — league-less, so it loads by draft id.
const MockDraftBoardScreen = lazyWithRetry(() =>
  import('../components/MockDraftBoard').then((m) => ({
    default: m.MockDraftBoardScreen,
  })),
);
// The Mock Drafts hub (LS-10079): public lobbies, my mock drafts, invites.
const MockDraftsHubPage = lazyWithRetry(() =>
  import('../pages/mock-drafts/MockDraftsHubPage').then((m) => ({
    default: m.MockDraftsHubPage,
  })),
);
const JoinByCodePage = lazyWithRetry(() =>
  import('../pages/join/JoinByCodePage').then((m) => ({
    default: m.JoinByCodePage,
  })),
);
const SeasonDraftGamePage = lazyWithRetry(
  () => import('../pages/games/SeasonDraftGamePage'),
);
const SeasonDraftGamesPage = lazyWithRetry(
  () => import('../pages/games/SeasonDraftGamesPage'),
);
const SeasonDraftGameCreatePage = lazyWithRetry(
  () => import('../pages/games/SeasonDraftGameCreatePage'),
);
const SeasonDraftJoinPage = React.lazy(
  () => import('../pages/games/SeasonDraftJoinPage'),
);
const DisclosureGamePage = lazyWithRetry(
  () => import('../pages/games/DisclosureGamePage'),
);
const MinigamesHubPage = lazyWithRetry(
  () => import('../pages/games/MinigamesHubPage'),
);
const TwentyQuestionsPage = lazyWithRetry(
  () => import('../pages/games/TwentyQuestionsPage'),
);
const PrivacyPolicyPage = lazyWithRetry(
  () => import('../pages/legal/PrivacyPolicyPage'),
);
const TermsOfServicePage = lazyWithRetry(
  () => import('../pages/legal/TermsOfServicePage'),
);
const EliteDraftBoardScreen = lazyWithRetry(() =>
  import('../components/EliteDraftBoard').then((m) => ({
    default: m.EliteDraftBoardScreen,
  })),
);
const EliteDraftSpectatorScreen = lazyWithRetry(() =>
  import('../components/EliteDraftSpectator').then((m) => ({
    default: m.EliteDraftSpectatorScreen,
  })),
);
const FootballHubPage = lazyWithRetry(() =>
  import('../pages/football/FootballHubPage').then((m) => ({
    default: m.FootballHubPage,
  })),
);
const FootballPlayersRedirectPage = lazyWithRetry(() =>
  import('../pages/football/FootballPlayersRedirectPage').then((m) => ({
    default: m.FootballPlayersRedirectPage,
  })),
);
const FootballPlayerDetailPage = lazyWithRetry(() =>
  import('../pages/football/FootballPlayerDetailPage').then((m) => ({
    default: m.FootballPlayerDetailPage,
  })),
);
const FootballPlayersComparePage = lazyWithRetry(() =>
  import('../pages/football/FootballPlayersComparePage').then((m) => ({
    default: m.FootballPlayersComparePage,
  })),
);
const FootballTeamDetailPage = lazyWithRetry(() =>
  import('../pages/football/FootballTeamDetailPage').then((m) => ({
    default: m.FootballTeamDetailPage,
  })),
);
const FootballViewGameLogsPage = lazyWithRetry(() =>
  import('../pages/football/FootballViewGameLogsPage').then((m) => ({
    default: m.FootballViewGameLogsPage,
  })),
);
const ForgotPasswordPage = lazyWithRetry(() =>
  import('../pages/forgot-password/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazyWithRetry(() =>
  import('../pages/reset-password/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
/** Route-level guard for admin pages — redirects non-admins to home.
 *  Defense-in-depth alongside the in-page accessLevel check in AdminPage. */
function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { user, isLoading } = useAuth();
  if (isLoading) return <UnifiedLoadingPanel fullScreen />;
  if (user?.accessLevel !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/** Redirects free-tier users to /pricing. Defense-in-depth for routes whose
 *  primary value is a premium feature (e.g. analytics). Loading state renders
 *  a full-screen spinner to prevent a flash of the premium route. */
function PremiumGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { isPremium, isLoading } = useIsPremiumStatus();
  if (isLoading) return <UnifiedLoadingPanel fullScreen />;
  if (!isPremium) return <Navigate to="/pricing" replace />;
  return children;
}

/** Redirects to home when the football_enabled GrowthBook flag is explicitly off.
 * Uses `true` as the fallback so the gate doesn't redirect while features are
 * still loading (avoids a flash redirect on first render or when GrowthBook is
 * unconfigured — e.g. E2E environments without a client key). */
function FootballGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const footballEnabled = useFeatureValue('football_enabled', true);
  if (footballEnabled === false) {
    trackFeatureGateBlocked('football_enabled');
    return <Navigate to="/" replace />;
  }
  return children;
}

const AdminPage = lazyWithRetry(() =>
  import('../pages/admin/AdminPage').then((m) => ({
    default: m.AdminPage,
  })),
);
const AdminRevenuePage = lazyWithRetry(
  () => import('../pages/admin/AdminRevenuePage'),
);
const AdminUsersPage = lazyWithRetry(
  () => import('../pages/admin/AdminUsersPage'),
);
const AdminAppDownloadsPage = lazyWithRetry(
  () => import('../pages/admin/AdminAppDownloadsPage'),
);
const ProfileSettingsPage = lazyWithRetry(
  () => import('../pages/profile/ProfileSettingsPage'),
);
const DiscordCallbackPage = lazyWithRetry(() =>
  import('../pages/auth/DiscordCallbackPage').then((m) => ({
    default: m.DiscordCallbackPage,
  })),
);
const SubscriptionPage = lazyWithRetry(
  () => import('../pages/profile/SubscriptionPage'),
);
const PreferencesPage = lazyWithRetry(
  () => import('../pages/preferences/PreferencesPage'),
);
const NotificationsPage = lazyWithRetry(
  () => import('../pages/notifications/NotificationsPage'),
);
const AnalyticsPage = lazyWithRetry(
  () => import('../pages/analytics/AnalyticsPage'),
);
const ScoreboardPage = lazyWithRetry(() =>
  import('../pages/scoreboard/ScoreboardPage').then((m) => ({
    default: m.ScoreboardPage,
  })),
);
const StandingsRedirectPage = lazyWithRetry(() =>
  import('../pages/standings/StandingsRedirectPage').then((m) => ({
    default: m.StandingsRedirectPage,
  })),
);
const DonatePage = lazyWithRetry(() => import('../pages/donate/DonatePage'));
const TradeCenterPage = lazyWithRetry(() =>
  import('../pages/trade-center/TradeCenterPage').then((m) => ({
    default: m.TradeCenterPage,
  })),
);

/* ────────────────────────────────────────────────────────
 * Nav – styled components
 * ──────────────────────────────────────────────────────── */

// Follows the active theme (LS-10697): `$background075` is the dark glass
// navy in dark (unchanged) and translucent white in light.
const NavContainer = styled(YStack, {
  backgroundColor: '$background075',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
});

const NavContent = styled(XStack, {
  alignItems: 'center',
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  gap: '$4',
});

/* ────────────────────────────────────────────────────────
 * Navigation component
 * ──────────────────────────────────────────────────────── */

const FONT_DISPLAY = "'Big Shoulders Display', system-ui, sans-serif";

/** Desktop pill-nav destinations — mirrors the mobile drawer's primary links. */
function useDesktopNavLinks(): NavLink[] {
  const location = useLocation();
  const navigate = useNavigate();

  const playersActive = location.pathname.startsWith('/players');
  const minigamesActive =
    location.pathname.startsWith('/games') ||
    location.pathname.startsWith('/draft');

  return [
    {
      label: 'Players',
      icon: 'users',
      active: playersActive,
      href: '/players',
      onPress: () => navigate('/players'),
    },
    {
      label: 'Minigames',
      icon: 'zap',
      active: minigamesActive,
      href: '/games',
      onPress: () => navigate('/games'),
    },
  ];
}

function Navigation() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navLinks = useDesktopNavLinks();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  // The bug-report dialog is controlled with no Dialog.Trigger, and the menu
  // item that opens it unmounts as its menu closes — so remember which
  // still-mounted control to return focus to on close (LS-10451).
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const bugReportReturnFocusRef = useRef<HTMLElement | null>(null);
  const openBugReport = (returnFocusTo: HTMLElement | null) => {
    bugReportReturnFocusRef.current = returnFocusTo;
    setBugDialogOpen(true);
  };
  const [compact, setCompact] = useState(false);
  const isDarkTheme = useThemeContext().resolvedTheme === 'dark';

  // Condense nav when user scrolls down
  useEffect(() => {
    const handler = () => setCompact(window.scrollY > 80);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Prefetch the Home page chunk once per mount so the logo/home link is
  // instant even when Home was never the first page loaded this session —
  // e.g. a deep link straight into a league page (LS-9350). Captured via ref
  // so this only ever reflects the route present at mount, not later ones.
  // Skipped under automated browsers (same navigator.webdriver gate used
  // elsewhere in this file's config) — this fetch is purely a speculative
  // optimization with no test value, and it can still be in flight when a
  // hermetic E2E test's browser context closes, surfacing as a stray
  // "Test ended" route-callback error unrelated to what the test asserts.
  const initialPathnameRef = useRef(location.pathname);
  useEffect(() => {
    if (
      initialPathnameRef.current !== '/' &&
      typeof navigator !== 'undefined' &&
      navigator.webdriver !== true
    ) {
      void prefetchHomePage();
    }
  }, []);

  if (!isAuthenticated) return null;

  return (
    <YStack
      role="banner"
      style={{ position: 'sticky', overflow: 'visible' }}
      top={0}
      zIndex={NAV_Z_INDEX}
    >
      <nav aria-label="Primary">
        <NavContainer
          style={{
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            // Dark keeps its panel-border hairline; light uses the subtler
            // outline (LS-10697 design spec).
            borderBottomColor: isDarkTheme
              ? compact
                ? 'rgba(31,45,72,0.6)'
                : 'rgba(31,45,72,1)'
              : 'var(--outlineSubtle)',
          }}
        >
          {/* ── Desktop layout (hidden on mobile) ──
              Sticky top nav composed from the design-system NavBar (LS-4652) —
              brand/logo lives in `logo` (NavBar's own `brand` text is unused,
              this app keeps its two-line wordmark), league switcher in
              `afterBrand`, primary tabs in `links`, account cluster in
              `trailing`. */}
          <NavContent
            display="none"
            $gtMd={{ display: 'flex' }}
            padding={0}
            gap={0}
          >
            <NavBar
              brand=""
              logo={
                <Link
                  to="/"
                  aria-label="Legacy Sports home"
                  style={{ textDecoration: 'none', flexShrink: 0 }}
                >
                  <XStack alignItems="center" gap={0} cursor="pointer">
                    <img
                      src="/logo.png"
                      alt="Legacy Sports"
                      data-testid="header-logo"
                      style={{
                        height: compact ? 30 : 38,
                        width: 'auto',
                        display: 'block',
                        transition: 'height 200ms ease',
                      }}
                    />
                    {/* Always mounted (rather than conditionally rendered)
                        and collapsed via width/opacity in the same 200ms
                        window as the logo's height transition above — a
                        hard mount/unmount here raced the logo's animation
                        and produced a brief overlap right at the `compact`
                        toggle. */}
                    <div
                      data-testid="brand-text"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        userSelect: 'none',
                        lineHeight: 1,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        marginLeft: compact ? 0 : 8,
                        maxWidth: compact ? 0 : 140,
                        opacity: compact ? 0 : 1,
                        transition:
                          'max-width 200ms ease, margin-left 200ms ease, opacity 150ms ease',
                      }}
                    >
                      <Text
                        color="$wordmarkGold"
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: '800',
                          fontSize: 14,
                          letterSpacing: '0.04em',
                          // Pixel value, not unitless: Tamagui's Text style
                          // treats a bare `1` as 1px, which clipped the
                          // wordmark to a 1px sliver (LS-10697).
                          lineHeight: '14px',
                        }}
                      >
                        LEGACY
                      </Text>
                      <Text
                        color="$color12"
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: '700',
                          fontSize: 11,
                          letterSpacing: '0.16em',
                          lineHeight: '11px',
                        }}
                      >
                        SPORTS
                      </Text>
                    </div>
                  </XStack>
                </Link>
              }
              afterBrand={<LeagueSwitcherChip />}
              links={navLinks}
              trailing={
                <XStack alignItems="center" gap="$2">
                  <NotificationDropdown />
                  <HelpMenuButton onBugReport={openBugReport} />
                  <UserProfileDropdown />
                </XStack>
              }
            />
          </NavContent>

          {/* ── Mobile header (hidden on desktop) ── */}
          <XStack
            display="flex"
            $gtMd={{ display: 'none' }}
            alignItems="center"
            gap="$3"
            paddingHorizontal="$4"
            paddingVertical="$3"
          >
            {/* Hamburger → drawer */}
            <button
              ref={menuButtonRef}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--color11)',
                width: 36,
                height: 36,
                borderRadius: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Menu size={20} />
            </button>

            {/* League chip — shrinks so Help + bell stay on-screen (LS-10705) */}
            <LeagueSwitcherChip fluid />

            <div style={{ flex: 1 }} />

            {/* Help & bug-report (mobile parity with desktop) */}
            <HelpMenuButton onBugReport={openBugReport} />

            {/* Notifications */}
            <NotificationDropdown />
          </XStack>
        </NavContainer>
      </nav>

      {/* One notification socket for both dropdowns above (LS-10715) */}
      <NotificationRealtimeSync />

      {/* Mobile drawer overlay */}
      <MobileNavDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onBugReport={() => openBugReport(menuButtonRef.current)}
      />

      {/* Bug report dialog (controlled — no trigger button rendered) */}
      <BugReportButton
        controlledOpen={bugDialogOpen}
        onDialogOpenChange={setBugDialogOpen}
        returnFocusRef={bugReportReturnFocusRef}
      />
    </YStack>
  );
}

// HomeScreen wrapper with navigation
function NavigableHomeScreen() {
  return <HomePage />;
}

const MainLayout = styled(YStack, {
  minHeight: '100vh',
  backgroundColor: '$background',
  color: '$color',
});

/**
 * Main App Component - Now authentication-free!
 * Authentication is handled by EnhancedAuthGuard at the root level.
 * This component only renders authenticated content.
 */
function App() {
  // Track page views automatically on route changes
  usePageTracking();
  // Announce page title to screen readers on route change
  useRouteAnnouncer();
  // Identify the authenticated user in analytics with real subscription tier
  useAnalyticsIdentify();
  // Register service worker and Web Push subscription for authenticated users
  useWebPushRegistration();

  const { pathname } = useLocation();

  // Big-screen / TV draft-watch routes suppress the standard app chrome
  // (nav, scoreboard ticker, mobile bottom bar) so the page is a clean
  // broadcast canvas (LS-8943). No pre-existing immersive/fullscreen
  // mechanism exists in this file to hook into, so this is a plain
  // route-prefix check.
  const isImmersiveRoute = pathname.endsWith('/draft/watch');

  // Restore saved scroll position when returning to a previously-visited route
  // (both back/forward POP and sport-switch PUSH navigations). Scroll to top
  // only on first visit, when no saved position exists.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.scrollTo !== 'function'
    ) {
      return;
    }
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(scrollPositionKey(pathname));
    } catch {
      // Ignore storage errors (private browsing, quota exceeded).
    }
    if (saved !== null) {
      const y = parseInt(saved, 10);
      // Defer so the page has time to render before restoring position.
      requestAnimationFrame(() => window.scrollTo(0, y));
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  // Capture scroll position just before the user navigates away.
  useEffect(() => {
    const save = makeScrollPositionSaver(pathname);
    window.addEventListener('beforeunload', save);
    return () => {
      save();
      window.removeEventListener('beforeunload', save);
    };
  }, [pathname]);

  return (
    <MainLayout>
      {/* Global screen reader announcer */}
      <GlobalAnnouncer />
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="skip-link sr-only"
        data-testid="skip-link"
        onClick={(e) => {
          // Improve focus behavior across browsers
          const target = document.getElementById('main-content');
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        Skip to main content
      </a>
      {/* Admin impersonation banner — shown only while impersonating */}
      <ImpersonationBanner />
      {/* Post-login billing hint — shown once for past-due premium users (LGN-029) */}
      <PostLoginBillingBanner />
      {/* Global toast for uncaught Apollo/GraphQL errors */}
      <ApolloErrorToast />
      <SuccessToast />
      {!isImmersiveRoute && <Navigation />}
      {/* Live scores ticker — renders only when today's MLB games are available.
          The spacer inside ScoreboardTicker ensures no blank strip on empty days. */}
      {!isImmersiveRoute && <ScoreboardTicker />}
      <YStack
        tag="main"
        role="main"
        flex={1}
        padding="$4"
        // Extra bottom padding so content isn't hidden behind the fixed bottom bar.
        // `$ltMd` is not a real media-query key in this project's breakpoint config (only
        // xs/sm/md/lg/xl/xxl and their gt* counterparts exist — see lib/design-tokens's
        // mediaQueries) so this override silently never applied; content could scroll to a
        // rest position under MobileBottomBar's fixed hit area, making bottom-of-page
        // controls unclickable on phones (LS-9327). `$md` matches MobileBottomBar's own
        // visibility toggle (`$gtMd={{ display: 'none' }}` below); 112px comfortably clears
        // the bar's ~87px rendered height. Narrower media queries win precedence over wider
        // ones in Tamagui's generated cascade, so `$sm`'s padding shorthand must repeat
        // paddingBottom explicitly or it silently resets it back to `$2` on phones.
        $sm={{ padding: '$2', paddingBottom: 112 }}
        paddingBottom="$4"
        $md={{ paddingBottom: 112 }}
        id="main-content"
        data-testid="main-content"
        tabIndex={-1}
      >
        <Suspense
          fallback={
            <YStack
              alignItems="center"
              justifyContent="center"
              paddingVertical="$6"
              role="status"
              aria-busy="true"
            >
              <Paragraph color="$colorPress">Loading...</Paragraph>
            </YStack>
          }
        >
          <Routes>
            {/* All routes are now authenticated by default */}
            <Route path="/" element={<NavigableHomeScreen />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            {/* /login and /signup are unauthenticated entry points served by
                EnhancedAuthGuard (they are not in PUBLIC_PATHS, so the guard
                shows the sign-in / sign-up flow to signed-out visitors). An
                already-authenticated user who navigates here — typing the URL,
                or following a stale "Create an account" link — passes the guard
                and reaches App instead, where these routes bounce them to home
                so the sign-up flow is never rendered for a signed-in user
                (LS-6690). */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route
              path="/football"
              element={
                <FootballGate>
                  <FootballHubPage />
                </FootballGate>
              }
            />
            <Route path="/league/create" element={<CreateLeagueWizardPage />} />
            {/* /football/players redirects to the canonical merged players
                route with NFL selected (LS-9077) — the standalone list page
                was retired once LS-8442 landed NFL browsing inline on
                /players via the sport switcher. */}
            <Route
              path="/football/players"
              element={
                <FootballGate>
                  <FootballPlayersRedirectPage />
                </FootballGate>
              }
            />
            {/* Static segment must precede /football/players/:id dynamic route. */}
            <Route
              path="/football/players/view-game-logs"
              element={
                <FootballGate>
                  <FootballViewGameLogsPage />
                </FootballGate>
              }
            />
            {/* Static segment must precede /football/players/:id dynamic route. */}
            <Route
              path="/football/players/compare"
              element={
                <FootballGate>
                  <FootballPlayersComparePage />
                </FootballGate>
              }
            />
            <Route
              path="/football/players/:id"
              element={
                <FootballGate>
                  <FootballPlayerDetailPage />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/create"
              element={
                <FootballGate>
                  <LeagueCreatePage />
                </FootballGate>
              }
            />
            <Route
              path="/football/leagues"
              element={
                <FootballGate>
                  <LeagueDiscoveryPage sport="football" />
                </FootballGate>
              }
            />
            {/* Static segment must precede /football/league/:id dynamic route. */}
            <Route
              path="/football/league/join"
              element={
                <FootballGate>
                  <JoinLeagueByCodePage />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/join/:inviteCode"
              element={
                <FootballGate>
                  <LegacyJoinRedirect />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/:id"
              element={
                <FootballGate>
                  <LeagueDetailPage />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/:id/:tab"
              element={
                <FootballGate>
                  <LeagueDetailPage />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/:id/draft"
              element={
                <FootballGate>
                  <EliteDraftBoardScreen />
                </FootballGate>
              }
            />
            {/* Read-only big-screen / public draft watch — football
                equivalent of the baseball route below (LS-9684). Signed-in
                only — deliberately not in PUBLIC_PATHS (main.tsx); access to
                private leagues is enforced server-side and surfaced by
                SpectatorScreen itself as a "This draft is private" state. */}
            <Route
              path="/football/league/:id/draft/watch"
              element={
                <FootballGate>
                  <EliteDraftSpectatorScreen />
                </FootballGate>
              }
            />
            <Route
              path="/football/league/:leagueId/matchups/:matchupId"
              element={
                <FootballGate>
                  <MatchupDetailPage />
                </FootballGate>
              }
            />
            <Route
              path="/football/teams/:teamId"
              element={
                <FootballGate>
                  <FootballTeamDetailPage />
                </FootballGate>
              }
            />
            <Route path="/baseball" element={<BaseballScreen />} />
            <Route
              path="/baseball/league/:id/draft"
              element={<EliteDraftBoardScreen />}
            />
            {/* Read-only big-screen / public draft watch (LS-8943). Signed-in
                only — deliberately not in PUBLIC_PATHS (main.tsx); access to
                private leagues is enforced server-side and surfaced by
                SpectatorScreen itself as a "This draft is private" state. */}
            <Route
              path="/baseball/league/:id/draft/watch"
              element={<EliteDraftSpectatorScreen />}
            />
            <Route path="/mock-drafts" element={<MockDraftsHubPage />} />
            <Route path="/baseball/mock-draft" element={<MockDraftPage />} />
            {/* A mock draft has no league, so it has its own room route
                (LS-10076). */}
            <Route
              path="/baseball/mock-draft/:draftId"
              element={<MockDraftBoardScreen />}
            />
            <Route
              path="/football/mock-draft/:draftId"
              element={<MockDraftBoardScreen />}
            />
            <Route
              path="/baseball/mock-draft/join"
              element={<LegacyJoinRedirect />}
            />
            <Route
              path="/baseball/mock-draft/join/:inviteCode"
              element={<LegacyJoinRedirect />}
            />
            <Route
              path="/baseball/league/create"
              element={<LeagueCreatePage />}
            />
            <Route
              path="/baseball/league/join"
              element={<JoinLeagueByCodePage />}
            />
            {/* Coded league invite links land on /join/:code (LS-10422). */}
            <Route
              path="/baseball/league/join/:inviteCode"
              element={<LegacyJoinRedirect />}
            />
            {/* The universal invite route (LS-10078): league and mock-draft codes. */}
            <Route path="/join" element={<JoinByCodePage />} />
            <Route path="/join/:code" element={<JoinByCodePage />} />
            <Route
              path="/baseball/leagues"
              element={<LeagueDiscoveryPage sport="baseball" />}
            />
            <Route path="/baseball/league/:id" element={<LeagueDetailPage />} />
            <Route
              path="/baseball/league/:id/:tab"
              element={<LeagueDetailPage />}
            />
            <Route
              path="/baseball/league/:id/:tab/:matchupId"
              element={<LeagueDetailPage />}
            />
            <Route
              path="/baseball/teams/:teamId"
              element={<TeamDetailPage />}
            />
            <Route
              path="/baseball/league/:leagueId/matchups/:matchupId"
              element={<MatchupDetailPage />}
            />
            <Route
              path="/matchup/:matchupId"
              element={<MatchupRedirectPage />}
            />
            <Route path="/management" element={<ManagementPage />} />
            {/* /players is the canonical merged player browse + stats surface
                (LS-9076) — /players/stats redirects here, preserving the
                query string. */}
            <Route path="/players" element={<PlayerStatsPage />} />
            {/* Statically imported (LS-9360) rather than lazyWithRetry'd like
                its siblings: this route does nothing but call <Navigate>, so
                code-splitting it added a chunk-fetch (Suspense fallback +
                network round trip) to the critical path of a redirect that
                should be instantaneous — the likely cause of the flaky
                15s-timeout E2E failures on the /players/stats → /players
                assertion. */}
            <Route
              path="/players/stats"
              element={<PlayersStatsRedirectPage />}
            />
            <Route path="/players/compare" element={<PlayerComparisonPage />} />
            {/* Static segment must precede the /players/:id dynamic route
                (react-router v6 ranks static over dynamic; ordered explicitly
                for clarity). LS-7864 */}
            <Route
              path="/players/view-game-logs"
              element={<ViewGameLogsPage />}
            />
            <Route path="/players/:id" element={<PlayerDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminPage />
                </AdminGuard>
              }
            />
            <Route path="/admin/revenue" element={<AdminRevenuePage />} />
            {/* Page-level access check rather than AdminGuard, matching
                /admin/revenue: a non-admin sees an explanation here instead of
                being redirected to the home page. */}
            <Route
              path="/admin/app-downloads"
              element={<AdminAppDownloadsPage />}
            />
            <Route
              path="/admin/users"
              element={
                <AdminGuard>
                  <AdminUsersPage />
                </AdminGuard>
              }
            />
            <Route path="/profile/settings" element={<ProfileSettingsPage />} />
            <Route
              path="/auth/discord/callback"
              element={<DiscordCallbackPage />}
            />
            <Route
              path="/profile/subscription"
              element={<SubscriptionPage />}
            />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route
              path="/leagues/:leagueId/analytics"
              element={
                <PremiumGuard>
                  <AnalyticsPage />
                </PremiumGuard>
              }
            />
            <Route path="/scoreboard" element={<ScoreboardPage />} />
            <Route path="/standings" element={<StandingsRedirectPage />} />
            <Route path="/games" element={<MinigamesHubPage />} />
            <Route
              path="/games/season-draft"
              element={<SeasonDraftGamesPage />}
            />
            <Route
              path="/games/season-draft/create"
              element={<SeasonDraftGameCreatePage />}
            />
            <Route
              path="/games/season-draft/join/:inviteCode"
              element={<SeasonDraftJoinPage />}
            />
            <Route
              path="/games/season-draft/:gameId"
              element={<SeasonDraftGamePage />}
            />
            <Route path="/games/disclosure" element={<DisclosureGamePage />} />
            <Route
              path="/games/twenty-questions"
              element={<TwentyQuestionsPage />}
            />
            <Route path="/donate" element={<DonatePage />} />
            <Route path="/trade-center" element={<TradeCenterPage />} />
            {/* /draft/mock is a legacy alias — redirect to the canonical route. */}
            <Route
              path="/draft/mock"
              element={<Navigate to="/baseball/mock-draft" replace />}
            />
            {/* /faq is a common alias that users and crawlers reach — redirect to the
                pricing page which contains the FAQ accordion section. */}
            <Route path="/faq" element={<Navigate to="/pricing" replace />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            {/* Catch-all — keep last. Unmatched URLs used to render an empty
                <main> (LS-10704); this shows a Not Found page instead and
                redirects legacy sport-less /league/:id links. */}
            <Route path="*" element={<CatchAllRoute />} />
          </Routes>
        </Suspense>
      </YStack>
      {/* Mobile bottom bar — fixed, hidden on desktop */}
      {!isImmersiveRoute && (
        <YStack display="flex" $gtMd={{ display: 'none' }}>
          <MobileBottomBar />
        </YStack>
      )}
    </MainLayout>
  );
}

// Explicit default export
const AppComponent = App;
export default AppComponent;
