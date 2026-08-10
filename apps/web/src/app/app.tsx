import React, { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Paragraph,
  UnifiedLoadingPanel,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { PlayersScreen } from '@legacy-sports/shared-components/players';
import { styled } from 'tamagui';
import { Menu } from '@tamagui/lucide-icons';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { UserProfileDropdown } from '../components/layout/UserProfileDropdown';
import { BugReportButton } from '../components/layout/BugReportButton';
import { NotificationDropdown } from '../components/layout/NotificationDropdown';
import { LeagueSwitcherChip } from '../components/layout/LeagueSwitcherChip';
import { NavPillTabs } from '../components/layout/NavPillTabs';
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
import { PageMeta } from '../components/PageMeta';
import { ApolloErrorToast } from '../components/layout/ApolloErrorToast';
import { ScoreboardTicker } from '../components/scoreboard/ScoreboardTicker';
import { NAV_Z_INDEX } from '../constants/dimensions';
import { useFeatureValue } from '../context/GrowthBookProvider';
import { useIsPremiumStatus } from '../hooks/useIsPremium';

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
const FootballPlayersPage = lazyWithRetry(() =>
  import('../pages/football/FootballPlayersPage').then((m) => ({
    default: m.FootballPlayersPage,
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
  if (footballEnabled === false) return <Navigate to="/" replace />;
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

const NavContainer = styled(YStack, {
  backgroundColor: 'rgba(10,15,26,0.78)',
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

function Navigation() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [compact, setCompact] = useState(false);

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
            borderBottomColor: compact
              ? 'rgba(31,45,72,0.6)'
              : 'rgba(31,45,72,1)',
          }}
        >
          {/* ── Desktop layout (hidden on mobile) ── */}
          <NavContent display="none" $gtMd={{ display: 'flex' }}>
            {/* Brand */}
            <Link
              to="/"
              aria-label="Legacy Sports home"
              style={{ textDecoration: 'none', flexShrink: 0 }}
            >
              <XStack alignItems="center" gap="$2" cursor="pointer">
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
                {!compact && (
                  <div
                    data-testid="brand-text"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      userSelect: 'none',
                      lineHeight: 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: '800',
                        fontSize: 14,
                        letterSpacing: '0.04em',
                        lineHeight: 1,
                        color: '#D4BB78',
                      }}
                    >
                      LEGACY
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: '700',
                        fontSize: 11,
                        letterSpacing: '0.16em',
                        lineHeight: 1,
                        color: '#F8FAFC',
                      }}
                    >
                      SPORTS
                    </span>
                  </div>
                )}
              </XStack>
            </Link>

            {/* League switcher */}
            <LeagueSwitcherChip />

            {/* Pill tabs — pushed right after the league switcher */}
            <XStack style={{ marginLeft: 'auto' }}>
              <NavPillTabs />
            </XStack>

            {/* Right cluster */}
            <XStack alignItems="center" gap="$2" style={{ marginLeft: 0 }}>
              <NotificationDropdown />
              <HelpMenuButton onBugReport={() => setBugDialogOpen(true)} />
              <UserProfileDropdown />
            </XStack>
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
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              style={{
                background: 'transparent',
                border: 0,
                color: '#DEE6FF',
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

            {/* League chip */}
            <LeagueSwitcherChip />

            <div style={{ flex: 1 }} />

            {/* Help & bug-report (mobile parity with desktop) */}
            <HelpMenuButton onBugReport={() => setBugDialogOpen(true)} />

            {/* Notifications */}
            <NotificationDropdown />
          </XStack>
        </NavContainer>
      </nav>

      {/* Mobile drawer overlay */}
      <MobileNavDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onBugReport={() => setBugDialogOpen(true)}
      />

      {/* Bug report dialog (controlled — no trigger button rendered) */}
      <BugReportButton
        controlledOpen={bugDialogOpen}
        onDialogOpenChange={setBugDialogOpen}
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
      saved = sessionStorage.getItem(`scroll:${pathname}`);
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
    const save = () => {
      try {
        sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
      } catch {
        // Ignore storage errors (private browsing, quota exceeded).
      }
    };
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
      {!isImmersiveRoute && <Navigation />}
      {/* Live scores ticker — renders only when today's MLB games are available.
          The spacer inside ScoreboardTicker ensures no blank strip on empty days. */}
      {!isImmersiveRoute && <ScoreboardTicker />}
      <YStack
        tag="main"
        role="main"
        flex={1}
        padding="$4"
        $sm={{ padding: '$2' }}
        // Extra bottom padding on mobile so content isn't hidden behind the fixed bottom bar
        paddingBottom="$4"
        $ltMd={{ paddingBottom: 80 }}
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
            <Route
              path="/football/players"
              element={
                <FootballGate>
                  <FootballPlayersPage />
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
                  <LeagueDiscoveryPage />
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
                  <JoinLeagueByCodePage />
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
            <Route path="/baseball/mock-draft" element={<MockDraftPage />} />
            <Route
              path="/baseball/league/create"
              element={<LeagueCreatePage />}
            />
            <Route
              path="/baseball/league/join"
              element={<JoinLeagueByCodePage />}
            />
            <Route
              path="/baseball/league/join/:inviteCode"
              element={<JoinLeagueByCodePage />}
            />
            <Route path="/baseball/leagues" element={<LeagueDiscoveryPage />} />
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
            <Route
              path="/players"
              element={
                <>
                  <PageMeta
                    title="All Players"
                    description="Browse every player available across your Legacy Sports fantasy leagues."
                  />
                  <PlayersScreen />
                </>
              }
            />
            <Route path="/players/stats" element={<PlayerStatsPage />} />
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
