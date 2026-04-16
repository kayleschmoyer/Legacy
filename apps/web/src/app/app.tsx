import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { FootballScreen } from '@legacy-sports/shared-components/sports';
import { PlayersScreen } from '@legacy-sports/shared-components/players';
import { styled } from 'tamagui';
import {
  Activity,
  BarChart2,
  Circle,
  Gamepad2,
  Globe,
  HelpCircle,
  Info,
  Menu,
  Tag,
  Users,
  X,
} from '@tamagui/lucide-icons';
import { UserProfileDropdown } from '../components/layout/UserProfileDropdown';
import { SportsDropdown } from '../components/layout/SportsDropdown';
import { PlayersDropdown } from '../components/layout/PlayersDropdown';

import { MyLeaguesDropdown } from '../components/layout/MyLeaguesDropdown';
import { BugReportButton } from '../components/layout/BugReportButton';
import { NotificationDropdown } from '../components/layout/NotificationDropdown';
import { GlobalAnnouncer } from '../components/a11y/GlobalAnnouncer';
import { usePageTracking } from '../hooks/usePageTracking';
import { useRouteAnnouncer } from '../hooks/useRouteAnnouncer';
import { useAnalyticsIdentify } from '../hooks/useAnalyticsIdentify';
import { useWebPushRegistration } from '../hooks/useWebPushRegistration';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import { ApolloErrorToast } from '../components/layout/ApolloErrorToast';
import { ScoreboardTicker } from '../components/scoreboard/ScoreboardTicker';

import { NAV_BUTTON_MIN_WIDTH, NAV_Z_INDEX } from '../constants/dimensions';

/* ────────────────────────────────────────────────────────
 * Lazy-loaded routes — these pages are split into separate
 * chunks and only downloaded when the user navigates to them.
 * ──────────────────────────────────────────────────────── */
const HomePage = React.lazy(() => import('../pages/home/HomePage'));
const BaseballScreen = React.lazy(() =>
  import('../components/baseball').then((m) => ({
    default: m.BaseballScreen,
  })),
);
const PlayerStatsPage = React.lazy(() =>
  import('../pages/players/PlayerStatsPage').then((m) => ({
    default: m.PlayerStatsPage,
  })),
);
const PlayerDetailPage = React.lazy(() =>
  import('../pages/players/PlayerStatsPage').then((m) => ({
    default: m.PlayerDetailPage,
  })),
);
const PlayerComparisonPage = React.lazy(() =>
  import('../pages/players/PlayerComparisonPage').then((m) => ({
    default: m.PlayerComparisonPage,
  })),
);
const LeagueCreatePage = React.lazy(
  () => import('../pages/baseball/LeagueCreatePage'),
);
const LeagueDetailPage = React.lazy(
  () => import('../pages/baseball/LeagueDetailPage'),
);
const TeamDetailPage = React.lazy(() =>
  import('../pages/baseball/TeamDetailPage').then((m) => ({
    default: m.TeamDetailPage,
  })),
);
const JoinLeagueByCodePage = React.lazy(
  () => import('../pages/baseball/JoinLeagueByCodePage'),
);
const LeagueDiscoveryPage = React.lazy(() =>
  import('../pages/baseball/LeagueDiscoveryPage').then((m) => ({
    default: m.LeagueDiscoveryPage,
  })),
);
const MatchupDetailPage = React.lazy(() =>
  import('../pages/matchup/MatchupDetailPage').then((m) => ({
    default: m.MatchupDetailPage,
  })),
);
const ManagementPage = React.lazy(
  () => import('../pages/management/ManagementPage'),
);
const AboutPage = React.lazy(() => import('../pages/about/AboutPage'));
const HelpPage = React.lazy(() => import('../pages/help/HelpPage'));
const PricingPage = React.lazy(() => import('../pages/pricing/PricingPage'));
const MockDraftPage = React.lazy(() =>
  import('../pages/draft/MockDraftPage').then((m) => ({
    default: m.MockDraftPage,
  })),
);
const SeasonDraftGamePage = React.lazy(
  () => import('../pages/games/SeasonDraftGamePage'),
);
const SeasonDraftGamesPage = React.lazy(
  () => import('../pages/games/SeasonDraftGamesPage'),
);
const SeasonDraftGameCreatePage = React.lazy(
  () => import('../pages/games/SeasonDraftGameCreatePage'),
);
const DisclosureGamePage = React.lazy(
  () => import('../pages/games/DisclosureGamePage'),
);
const EliteDraftBoardScreen = React.lazy(() =>
  import('../components/EliteDraftBoard').then((m) => ({
    default: m.EliteDraftBoardScreen,
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
  if (isLoading) return null;
  if (user?.accessLevel !== 'admin') return <Navigate to="/" replace />;
  return children;
}

const AdminPage = React.lazy(() =>
  import('../pages/admin/AdminPage').then((m) => ({
    default: m.AdminPage,
  })),
);
const AdminRevenuePage = React.lazy(
  () => import('../pages/admin/AdminRevenuePage'),
);
const ProfileSettingsPage = React.lazy(
  () => import('../pages/profile/ProfileSettingsPage'),
);
const DiscordCallbackPage = React.lazy(() =>
  import('../pages/auth/DiscordCallbackPage').then((m) => ({
    default: m.DiscordCallbackPage,
  })),
);
const SubscriptionPage = React.lazy(
  () => import('../pages/profile/SubscriptionPage'),
);
const PreferencesPage = React.lazy(
  () => import('../pages/preferences/PreferencesPage'),
);
const NotificationsPage = React.lazy(
  () => import('../pages/notifications/NotificationsPage'),
);
const ScoreboardPage = React.lazy(() =>
  import('../pages/scoreboard/ScoreboardPage').then((m) => ({
    default: m.ScoreboardPage,
  })),
);

/* ────────────────────────────────────────────────────────
 * Modern Header – styled components
 * ──────────────────────────────────────────────────────── */

/** Gradient accent bar at the very top of the page */
const AccentBar = styled(YStack, {
  height: 3,
  width: '100%',
  // gradient applied via inline style (Tamagui doesn't support CSS gradients natively)
});

const NavContainer = styled(YStack, {
  backgroundColor: '$surfacePanel',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
});

const NavContent = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  gap: '$4',
});

const NavLinks = styled(XStack, {
  alignItems: 'center',
  gap: '$3',
  justifyContent: 'center',
  minWidth: 0,
  flexWrap: 'nowrap',
  // Explicit overflow: visible ensures dropdown menus extending below the nav
  // are not clipped (CSS default, but stated for clarity).
  overflow: 'visible',
});

/** Square-edged nav link button with active bottom-border indicator */
const NavLinkButton = styled(Button, {
  size: '$3',
  borderRadius: '$2',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  paddingHorizontal: '$4',
  gap: '$2',
  flexShrink: 0,
  minWidth: NAV_BUTTON_MIN_WIDTH,
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
    scale: 0.97,
  },
  variants: {
    active: {
      true: {
        borderBottomColor: '$brandNavy',
        fontWeight: '600',
      },
    },
  } as const,
});

/** Hamburger / mobile menu button */
const MobileMenuButton = styled(Button, {
  display: 'flex',
  $gtMd: { display: 'none' },
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: '$2',
  borderRadius: '$4',
  hoverStyle: {
    backgroundColor: '$color3',
  },
});

/** Mobile slide-down nav panel */
const MobileNavPanel = styled(YStack, {
  display: 'flex',
  $gtMd: { display: 'none' },
  backgroundColor: '$surfacePanel',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  gap: '$2',
});

const MobileNavLink = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: '$3',
  borderRadius: '$3',
  width: '100%',
  gap: '$3',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  variants: {
    active: {
      true: {
        backgroundColor: '$color3',
        fontWeight: '600',
      },
    },
  } as const,
});

/* ────────────────────────────────────────────────────────
 * Navigation component
 * ──────────────────────────────────────────────────────── */

function Navigation() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname],
  );

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile nav on outside click.
  // Suppressed while the bug-report dialog is open because Dialog.Portal
  // renders outside mobileRef, so any click inside the dialog would
  // otherwise be treated as an outside click and collapse the nav panel.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bugDialogOpen) return;
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    if (mobileOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [mobileOpen, bugDialogOpen]);

  // Handle Escape key to close mobile nav
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen]);

  return (
    <YStack
      ref={mobileRef}
      role="banner"
      style={{ position: 'sticky', overflow: 'visible' }}
      top={0}
      // NAV_Z_INDEX must exceed every secondary sticky element (e.g. CONTENT_STICKY_Z_INDEX)
      // so the nav bar always remains above page content when both are sticky.
      zIndex={NAV_Z_INDEX}
    >
      {/* Gradient accent strip */}
      <AccentBar
        style={{
          background:
            'linear-gradient(90deg, #1B3A5C 0%, #C41E3A 35%, #C5A55A 70%, #1B3A5C 100%)',
        }}
      />

      <NavContainer>
        <NavContent>
          {/* ── Brand ── */}
          <XStack flex={1} alignItems="center" justifyContent="flex-start">
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
                  style={{ height: 38, width: 'auto', display: 'block' }}
                />
                <Paragraph
                  marginBottom={0}
                  fontWeight="700"
                  fontSize={22}
                  color="$color12"
                  letterSpacing={1}
                  userSelect="none"
                  data-testid="brand-text"
                  style={{ fontFamily: "'Big Shoulders Display', sans-serif" }}
                >
                  Legacy Sports
                </Paragraph>
              </XStack>
            </Link>
          </XStack>

          {/* ── Desktop Navigation ── */}
          <NavLinks
            as="nav"
            role="navigation"
            aria-label="Primary"
            display="none"
            $gtMd={{ display: 'flex' }}
          >
            <SportsDropdown />
            <PlayersDropdown />
            <MyLeaguesDropdown />

            <Link
              to="/games/season-draft"
              style={{ textDecoration: 'none', flexShrink: 0 }}
              aria-current={
                location.pathname.startsWith('/games') ? 'page' : undefined
              }
            >
              <NavLinkButton active={location.pathname.startsWith('/games')}>
                <XStack alignItems="center" gap="$2">
                  <Gamepad2 size={15} />
                  <Paragraph marginBottom={0}>Games</Paragraph>
                </XStack>
              </NavLinkButton>
            </Link>
          </NavLinks>

          {/* ── Right section ── */}
          <XStack
            flex={1}
            alignItems="center"
            justifyContent="flex-end"
            gap="$3"
          >
            {/* Hide bug-report on narrow viewports to keep hamburger in viewport */}
            <XStack display="none" $gtMd={{ display: 'flex' }}>
              <BugReportButton />
            </XStack>
            <NotificationDropdown />
            <UserProfileDropdown />

            {/* Mobile hamburger */}
            <MobileMenuButton
              onPress={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </MobileMenuButton>
          </XStack>
        </NavContent>
      </NavContainer>

      {/* ── Mobile Navigation Panel ── */}
      {mobileOpen && (
        <MobileNavPanel role="navigation" aria-label="Mobile">
          <Link to="/football" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/football')}
              onPress={() => setMobileOpen(false)}
            >
              <Activity size={16} />
              <Paragraph marginBottom={0}>Football</Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/baseball" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={location.pathname.startsWith('/baseball')}
              onPress={() => setMobileOpen(false)}
            >
              <Circle size={16} />
              <Paragraph marginBottom={0}>Baseball</Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/baseball/leagues" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/baseball/leagues')}
              onPress={() => setMobileOpen(false)}
            >
              <Globe size={16} />
              <Paragraph marginBottom={0}>Browse Leagues</Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/players" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/players')}
              onPress={() => setMobileOpen(false)}
            >
              <Users size={16} />
              <Paragraph marginBottom={0}>Players</Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/players/stats" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/players/stats')}
              onPress={() => setMobileOpen(false)}
            >
              <BarChart2 size={16} />
              <Paragraph marginBottom={0}>Player Stats</Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/games/season-draft" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={location.pathname.startsWith('/games')}
              onPress={() => setMobileOpen(false)}
            >
              <Gamepad2 size={16} />
              <Paragraph marginBottom={0}>Games</Paragraph>
            </MobileNavLink>
          </Link>
          {/* Help & Info group */}
          <YStack
            borderTopWidth={1}
            borderTopColor="$borderColor"
            paddingTop="$2"
            marginTop="$1"
            gap="$1"
          >
            <Paragraph
              size="$2"
              color="$colorPress"
              paddingHorizontal="$3"
              paddingVertical="$1"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
            >
              Help &amp; Info
            </Paragraph>
            <Link to="/about" style={{ textDecoration: 'none' }}>
              <MobileNavLink
                active={isActive('/about')}
                onPress={() => setMobileOpen(false)}
              >
                <Info size={16} />
                <Paragraph marginBottom={0}>About</Paragraph>
              </MobileNavLink>
            </Link>
            <Link to="/help" style={{ textDecoration: 'none' }}>
              <MobileNavLink
                active={isActive('/help')}
                onPress={() => setMobileOpen(false)}
              >
                <HelpCircle size={16} />
                <Paragraph marginBottom={0}>Help</Paragraph>
              </MobileNavLink>
            </Link>
            <Link to="/pricing" style={{ textDecoration: 'none' }}>
              <MobileNavLink
                active={isActive('/pricing')}
                onPress={() => setMobileOpen(false)}
              >
                <Tag size={16} />
                <Paragraph marginBottom={0}>Pricing</Paragraph>
              </MobileNavLink>
            </Link>
            <XStack paddingHorizontal="$3" paddingVertical="$1">
              <BugReportButton onDialogOpenChange={setBugDialogOpen} />
            </XStack>
          </YStack>
        </MobileNavPanel>
      )}
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

  // Scroll to top on every route change so navigating from a long page
  // (e.g. /pricing → /help) doesn't land mid-page.
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.scrollTo === 'function'
    ) {
      window.scrollTo(0, 0);
    }
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
      {/* Global toast for uncaught Apollo/GraphQL errors */}
      <ApolloErrorToast />
      <Navigation />
      {/* Live scores ticker — renders only when today's MLB games are available.
          The spacer inside ScoreboardTicker ensures no blank strip on empty days. */}
      <ScoreboardTicker />
      <YStack
        flex={1}
        padding="$4"
        $sm={{ padding: '$2' }}
        id="main-content"
        data-testid="main-content"
        role="main"
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
            <Route path="/football" element={<FootballScreen />} />
            <Route path="/baseball" element={<BaseballScreen />} />
            <Route
              path="/baseball/league/:id/draft"
              element={<EliteDraftBoardScreen />}
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
            <Route path="/baseball/team/:teamId" element={<TeamDetailPage />} />
            <Route
              path="/baseball/league/:leagueId/matchups/:matchupId"
              element={<MatchupDetailPage />}
            />
            <Route path="/management" element={<ManagementPage />} />
            <Route path="/players" element={<PlayersScreen />} />
            <Route path="/players/stats" element={<PlayerStatsPage />} />
            <Route path="/players/compare" element={<PlayerComparisonPage />} />
            <Route path="/players/:id" element={<PlayerDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/faq" element={<Navigate to="/help" replace />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminPage />
                </AdminGuard>
              }
            />
            <Route
              path="/admin/revenue"
              element={
                <AdminGuard>
                  <AdminRevenuePage />
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
            <Route path="/scoreboard" element={<ScoreboardPage />} />
            <Route
              path="/games/season-draft"
              element={<SeasonDraftGamesPage />}
            />
            <Route
              path="/games/season-draft/create"
              element={<SeasonDraftGameCreatePage />}
            />
            <Route
              path="/games/season-draft/:gameId"
              element={<SeasonDraftGamePage />}
            />
            <Route path="/games/disclosure" element={<DisclosureGamePage />} />
          </Routes>
        </Suspense>
      </YStack>
    </MainLayout>
  );
}

// Explicit default export
const AppComponent = App;
export default AppComponent;
