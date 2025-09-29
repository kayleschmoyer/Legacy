import React from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Button, H1, XStack, YStack } from '@legacy-sports/shared-components';
import { styled } from 'tamagui';
import {
  BaseballScreen,
  FootballScreen,
  PlayersScreen,
} from '@legacy-sports/shared-components';
import { WebHomeScreen } from '../components/WebHomeScreen';
import { UserProfileDropdown } from '../components/UserProfileDropdown';

import {
  WebPlayerDetailPage,
  WebPlayerStatsPage,
} from '../components/WebPlayerStatsPage';

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

const NavLink = styled(Link, {
  textDecoration: 'none',
});

function Navigation() {
  const location = useLocation();

  return (
    <NavContainer>
      <NavContent>
        {/* Logo/Brand Section */}
        <XStack alignItems="center" space="$4">
          <H1 color="$color" size="$6">
            <span role="img" aria-label="football">
              🏈
            </span>{' '}
            Legacy Sports
          </H1>
        </XStack>

        {/* Center Navigation Links */}
        <NavLinks display="none" $gtMd={{ display: 'flex' }}>
          <NavLink to="/">
            <Button
              variant={location.pathname === '/' ? 'primary' : 'secondary'}
              size="$3"
            >
              <span role="img" aria-label="home">
                🏠
              </span>{' '}
              Home
            </Button>
          </NavLink>
          <NavLink to="/football">
            <Button
              variant={
                location.pathname === '/football' ? 'primary' : 'secondary'
              }
              size="$3"
            >
              <span role="img" aria-label="football">
                🏈
              </span>{' '}
              Football
            </Button>
          </NavLink>
          <NavLink to="/baseball">
            <Button
              variant={
                location.pathname === '/baseball' ? 'primary' : 'secondary'
              }
              size="$3"
            >
              <span role="img" aria-label="baseball">
                ⚾
              </span>{' '}
              Baseball
            </Button>
          </NavLink>
          <NavLink to="/players">
            <Button
              variant={
                location.pathname === '/players' ? 'primary' : 'secondary'
              }
              size="$3"
            >
              <span role="img" aria-label="players">
                👤
              </span>{' '}
              Players
            </Button>
          </NavLink>
          <NavLink to="/players/stats">
            <Button
              variant={
                location.pathname === '/players/stats' ? 'primary' : 'secondary'
              }
              size="$3"
            >
              <span role="img" aria-label="statistics">
                📊
              </span>{' '}
              Player Stats
            </Button>
          </NavLink>
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
          <Route path="/players" element={<PlayersScreen />} />
          <Route path="/players/stats" element={<WebPlayerStatsPage />} />
          <Route path="/players/:id" element={<WebPlayerDetailPage />} />
        </Routes>
      </YStack>
    </MainLayout>
  );
}

export default App;
