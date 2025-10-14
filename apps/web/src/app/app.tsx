import React from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Button, H1, XStack, YStack } from '@legacy-sports/shared-components';
import { styled } from 'tamagui';
import {
  FootballScreen,
  PlayersScreen,
} from '@legacy-sports/shared-components';
import { WebHomeScreen } from '../components/WebHomeScreen';
import { UserProfileDropdown } from '../components/UserProfileDropdown';
import { SportsDropdown } from '../components/SportsDropdown';
import { PlayersDropdown } from '../components/PlayersDropdown';
import { BaseballScreen } from '../components/baseball';

import {
  WebPlayerDetailPage,
  WebPlayerStatsPage,
} from '../components/WebPlayerStatsPage';
import LeagueCreatePage from '../components/baseball/LeagueCreatePage';
import LeagueDetailPage from '../components/baseball/LeagueDetailPage';
import JoinLeagueByCode from '../components/baseball/JoinLeagueByCode';
import ManagementPage from '../components/ManagementPage';
import AboutPage from '../components/AboutPage';

// Styled Tamagui components for navigation
const NavContainer = styled(YStack, {
  backgroundColor: '$background',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  padding: '$4',
  position: 'sticky',
  top: 0,
  zIndex: 50,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 4,
});

const NavContent = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 1200,
  width: '100%',
  alignSelf: 'center',
  gap: '$6',
});

const NavLinks = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  flex: 1,
  justifyContent: 'center',
});

// Note: Using regular Link instead of styled to avoid "Functions are not valid as a React child" error

function Navigation() {
  const location = useLocation();

  return (
    <NavContainer>
      <NavContent>
        {/* Logo/Brand Section */}
        <XStack alignItems="center" space="$4">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <H1
              color="$color"
              size="$6"
              cursor="pointer"
              hoverStyle={{ opacity: 0.8 }}
            >
              <span role="img" aria-label="football">
                🏈
              </span>{' '}
              Legacy Sports
            </H1>
          </Link>
        </XStack>

        {/* Center Navigation Links */}
        <NavLinks display="none" $gtMd={{ display: 'flex' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button
              variant={location.pathname === '/' ? 'primary' : 'secondary'}
              size="$3"
            >
              <span role="img" aria-label="home">
                🏠
              </span>{' '}
              Home
            </Button>
          </Link>

          {/* Sports Dropdown - Football and Baseball */}
          <SportsDropdown />

          {/* Players Dropdown - All Players and Stats */}
          <PlayersDropdown />

          <Link to="/management" style={{ textDecoration: 'none' }}>
            <Button
              variant={
                location.pathname === '/management' ? 'primary' : 'secondary'
              }
              size="$3"
            >
              <span role="img" aria-label="management">
                ⚙️
              </span>{' '}
              Management
            </Button>
          </Link>
          <Link to="/about" style={{ textDecoration: 'none' }}>
            <Button
              variant={location.pathname === '/about' ? 'primary' : 'secondary'}
              size="$3"
            >
              <span role="img" aria-label="info">
                ℹ️
              </span>{' '}
              About
            </Button>
          </Link>
        </NavLinks>

        {/* User Profile Section */}
        <XStack alignItems="center" space="$3">
          <UserProfileDropdown />
        </XStack>
      </NavContent>
    </NavContainer>
  );
}

// HomeScreen wrapper with navigation
function NavigableHomeScreen() {
  return <WebHomeScreen />;
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
  console.log('Rendering authenticated app content...');

  return (
    <MainLayout>
      <Navigation />
      <YStack flex={1} padding="$4">
        <Routes>
          {/* All routes are now authenticated by default */}
          <Route path="/" element={<NavigableHomeScreen />} />
          <Route path="/football" element={<FootballScreen />} />
          <Route path="/baseball" element={<BaseballScreen />} />
          <Route
            path="/baseball/league/create"
            element={<LeagueCreatePage />}
          />
          <Route path="/baseball/league/join" element={<JoinLeagueByCode />} />
          <Route
            path="/baseball/league/join/:inviteCode"
            element={<JoinLeagueByCode />}
          />
          <Route path="/baseball/league/:id" element={<LeagueDetailPage />} />
          <Route path="/management" element={<ManagementPage />} />
          <Route path="/players" element={<PlayersScreen />} />
          <Route path="/players/stats" element={<WebPlayerStatsPage />} />
          <Route path="/players/:id" element={<WebPlayerDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </YStack>
    </MainLayout>
  );
}

// Explicit default export
const AppComponent = App;
export default AppComponent;
