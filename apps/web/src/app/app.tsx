import React, { useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Button, H1, XStack, YStack } from '@legacy-sports/shared-components';
import { Popover, styled, Text } from 'tamagui';
import { ChevronDown } from '@tamagui/lucide-icons';
import {
  FootballScreen,
  PlayersScreen,
} from '@legacy-sports/shared-components';
import { WebHomeScreen } from '../components/WebHomeScreen';
import { UserProfileDropdown } from '../components/UserProfileDropdown';
import { BaseballScreen } from '../components/baseball';

import {
  WebPlayerDetailPage,
  WebPlayerStatsPage,
} from '../components/WebPlayerStatsPage';
import LeagueCreatePage from '../components/baseball/LeagueCreatePage';
import LeagueDetailPage from '../components/baseball/LeagueDetailPage';

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

function BaseballDropdownMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  
  const isBaseballActive = location.pathname?.startsWith('/baseball') ?? false;

  return (
    <Popover size="$5" allowFlip placement="bottom" open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          variant={isBaseballActive ? 'primary' : 'secondary'}
          size="$3"
          onPress={() => setIsOpen(!isOpen)}
        >
          <span role="img" aria-label="baseball">
            ⚾
          </span>{' '}
          Baseball{' '}
          <ChevronDown
            size="$0.75"
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </Button>
      </Popover.Trigger>
      
      <Popover.Content
        borderWidth={1}
        borderColor="$borderColor"
        enterStyle={{ y: -10, opacity: 0 }}
        exitStyle={{ y: -10, opacity: 0 }}
        elevate
        animation={[
          'quick',
          {
            opacity: {
              overshootClamping: true,
            },
          },
        ]}
        padding="$2"
        backgroundColor="$background"
        minWidth={180}
      >
        <YStack space="$1">
          <Link to="/baseball" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              size="$3"
              justifyContent="flex-start"
              width="100%"
              onPress={() => setIsOpen(false)}
            >
              <span role="img" aria-label="baseball-home">
                🏠
              </span>{' '}
              Baseball Home
            </Button>
          </Link>
          
          <Link to="/baseball/league/create" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              size="$3"
              justifyContent="flex-start"
              width="100%"
              onPress={() => setIsOpen(false)}
            >
              <span role="img" aria-label="create-league">
                ➕
              </span>{' '}
              Create League
            </Button>
          </Link>
        </YStack>
      </Popover.Content>
    </Popover>
  );
}

function Navigation() {
  const location = useLocation();

  return (
    <NavContainer>
      <NavContent>
        {/* Logo/Brand Section */}
        <XStack alignItems="center" space="$4">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <H1 color="$color" size="$6" cursor="pointer" hoverStyle={{ opacity: 0.8 }}>
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
          <Link to="/football" style={{ textDecoration: 'none' }}>
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
          </Link>
          {/* Baseball Dropdown Menu */}
          <BaseballDropdownMenu />
          <Link to="/players" style={{ textDecoration: 'none' }}>
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
          </Link>
          <Link to="/players/stats" style={{ textDecoration: 'none' }}>
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
          <Route path="/baseball/league/create" element={<LeagueCreatePage />} />
          <Route path="/baseball/league/:id" element={<LeagueDetailPage />} />
          <Route path="/players" element={<PlayersScreen />} />
          <Route path="/players/stats" element={<WebPlayerStatsPage />} />
          <Route path="/players/:id" element={<WebPlayerDetailPage />} />
        </Routes>
      </YStack>
    </MainLayout>
  );
}

// Explicit default export
const AppComponent = App;
export default AppComponent;
