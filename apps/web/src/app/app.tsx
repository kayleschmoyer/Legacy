import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  Button,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { styled } from 'tamagui';
import {
  FootballScreen,
  PlayersScreen,
} from '@legacy-sports/shared-components';
import HomePage from '../pages/home/HomePage';
import { UserProfileDropdown } from '../components/layout/UserProfileDropdown';
import { SportsDropdown } from '../components/layout/SportsDropdown';
import { PlayersDropdown } from '../components/layout/PlayersDropdown';
import { BaseballScreen } from '../components/baseball';

import {
  PlayerDetailPage,
  PlayerStatsPage,
} from '../pages/players/PlayerStatsPage';
import LeagueCreatePage from '../pages/baseball/LeagueCreatePage';
import LeagueDetailPage from '../pages/baseball/LeagueDetailPage';
import { TeamDetailPage } from '../pages/baseball/TeamDetailPage';
import JoinLeagueByCodePage from '../pages/baseball/JoinLeagueByCodePage';
import ManagementPage from '../pages/management/ManagementPage';
import AboutPage from '../pages/about/AboutPage';
import { DraftBoardPage } from '../pages/draft/DraftBoardPage';
import { GlobalAnnouncer } from '../components/a11y/GlobalAnnouncer';
import { MatchupDetailPage } from '../pages/matchup/MatchupDetailPage';
import { usePageTracking } from '../hooks/usePageTracking';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import { AdminPage } from '../pages/admin/AdminPage';
import ProfileSettingsPage from '../pages/profile/ProfileSettingsPage';

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
  backgroundColor: '$background',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  position: 'sticky' as never,
  top: 0,
  zIndex: 50,
  // backdrop-blur applied via inline style
});

const NavContent = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  gap: '$4',
});

const NavLinks = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  flex: 1,
  justifyContent: 'center',
});

/** Pill-shaped nav link button with active indicator dot */
const NavLinkButton = styled(Button, {
  size: '$3',
  borderRadius: '$10',
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingHorizontal: '$4',
  gap: '$2',
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
        backgroundColor: '$color3',
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
  backgroundColor: '$background',
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
  const mobileRef = useRef<HTMLDivElement>(null);

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname],
  );

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile nav on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    if (mobileOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [mobileOpen]);

  return (
    <YStack ref={mobileRef} role="banner">
      {/* Gradient accent strip */}
      <AccentBar
        style={{
          background:
            'linear-gradient(90deg, #1B3A5C 0%, #C41E3A 35%, #C5A55A 70%, #1B3A5C 100%)',
        }}
      />

      <NavContainer
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <NavContent>
          {/* ── Brand ── */}
          <Link
            to="/"
            aria-label="Legacy Sports home"
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            <XStack alignItems="center" gap="$3" cursor="pointer">
              <YStack
                width={38}
                height={38}
                borderRadius="$4"
                alignItems="center"
                justifyContent="center"
                style={{
                  background:
                    'linear-gradient(135deg, #1B3A5C 0%, #2C4A7C 100%)',
                }}
              >
                <Paragraph fontSize={20} lineHeight={22}>
                  <span role="img" aria-label="baseball">
                    ⚾
                  </span>
                </Paragraph>
              </YStack>
              <YStack>
                <Paragraph
                  color="$color"
                  fontSize={18}
                  fontWeight="700"
                  letterSpacing={-0.3}
                  lineHeight={22}
                >
                  Legacy Sports
                </Paragraph>
                <Paragraph
                  color="$colorPress"
                  fontSize={11}
                  fontWeight="500"
                  letterSpacing={0.5}
                  lineHeight={14}
                  textTransform="uppercase"
                >
                  Fantasy League
                </Paragraph>
              </YStack>
            </XStack>
          </Link>

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

            <Link
              to="/about"
              style={{ textDecoration: 'none' }}
              aria-current={isActive('/about') ? 'page' : undefined}
            >
              <NavLinkButton active={isActive('/about')}>
                <Paragraph marginBottom={0}>
                  <span role="img" aria-label="info">
                    ℹ️
                  </span>{' '}
                  About
                </Paragraph>
              </NavLinkButton>
            </Link>
          </NavLinks>

          {/* ── Right section ── */}
          <XStack alignItems="center" gap="$3" flexShrink={0}>
            <UserProfileDropdown />

            {/* Mobile hamburger */}
            <MobileMenuButton
              onPress={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              <Paragraph fontSize={22} lineHeight={24}>
                {mobileOpen ? '✕' : '☰'}
              </Paragraph>
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
              <span role="img" aria-label="football">
                🏈
              </span>{' '}
              Football
            </MobileNavLink>
          </Link>
          <Link to="/baseball" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={location.pathname.startsWith('/baseball')}
              onPress={() => setMobileOpen(false)}
            >
              <span role="img" aria-label="baseball">
                ⚾
              </span>{' '}
              Baseball
            </MobileNavLink>
          </Link>
          <Link to="/players" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/players')}
              onPress={() => setMobileOpen(false)}
            >
              <span role="img" aria-label="players">
                👥
              </span>{' '}
              Players
            </MobileNavLink>
          </Link>
          <Link to="/players/stats" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/players/stats')}
              onPress={() => setMobileOpen(false)}
            >
              <Paragraph marginBottom={0}>
                <span role="img" aria-label="statistics">
                  📊
                </span>{' '}
                Player Stats
              </Paragraph>
            </MobileNavLink>
          </Link>
          <Link to="/about" style={{ textDecoration: 'none' }}>
            <MobileNavLink
              active={isActive('/about')}
              onPress={() => setMobileOpen(false)}
            >
              <Paragraph marginBottom={0}>
                <span role="img" aria-label="info">
                  ℹ️
                </span>{' '}
                About
              </Paragraph>
            </MobileNavLink>
          </Link>
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

  console.log('Rendering authenticated app content...');

  return (
    <MainLayout>
      {/* Global screen reader announcer */}
      <GlobalAnnouncer />
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="skip-link sr-only"
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
      <Navigation />
      <YStack flex={1} padding="$4" id="main-content" tabIndex={-1}>
        <Routes>
          {/* All routes are now authenticated by default */}
          <Route path="/" element={<NavigableHomeScreen />} />
          <Route path="/football" element={<FootballScreen />} />
          <Route path="/baseball" element={<BaseballScreen />} />
          <Route
            path="/baseball/league/:id/draft"
            element={<DraftBoardPage />}
          />
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
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/profile/settings" element={<ProfileSettingsPage />} />
        </Routes>
      </YStack>
    </MainLayout>
  );
}

// Explicit default export
const AppComponent = App;
export default AppComponent;
