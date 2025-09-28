/* eslint-disable @typescript-eslint/no-unsafe-call */
import React, { useEffect, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { HomeScreen, useAuth } from '@legacy-sports/shared-components';

import {
  BaseballScreen,
  FootballScreen,
  PlayersScreen,
} from '../components/screens';

import { LoadingPanel } from '../components/LoadingPanel';
import Login from '../components/Login';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  WebPlayerDetailPage,
  WebPlayerStatsPage,
} from '../components/WebPlayerStatsPage';

// Simple Navigation Component
interface AuthContext {
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

function Navigation() {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth() as AuthContext;

  const navStyle = {
    backgroundColor: '#1E1E1E',
    padding: '1rem',
    borderBottom: '1px solid #333',
  };

  const linkStyle = {
    color: '#FFFFFF',
    textDecoration: 'none',
    padding: '0.5rem 1rem',
    margin: '0 0.5rem',
    borderRadius: '4px',
    border: '1px solid #3366FF',
    backgroundColor: 'transparent',
    transition: 'all 0.2s',
  };

  const activeLinkStyle = {
    ...linkStyle,
    backgroundColor: '#3366FF',
  };

  return (
    <nav style={navStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <h1
          style={{
            color: '#FFFFFF',
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 'bold',
          }}
        >
          <span role="img" aria-label="football">
            🏈
          </span>{' '}
          Fantasy Sports Hub
        </h1>
        {isAuthenticated && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link
              to="/"
              style={location.pathname === '/' ? activeLinkStyle : linkStyle}
            >
              <span role="img" aria-label="home">
                🏠
              </span>{' '}
              Home
            </Link>
            <Link
              to="/football"
              style={
                location.pathname === '/football' ? activeLinkStyle : linkStyle
              }
            >
              <span role="img" aria-label="football">
                🏈
              </span>{' '}
              Football
            </Link>
            <Link
              to="/baseball"
              style={
                location.pathname === '/baseball' ? activeLinkStyle : linkStyle
              }
            >
              <span role="img" aria-label="baseball">
                ⚾
              </span>{' '}
              Baseball
            </Link>
            <Link
              to="/players"
              style={
                location.pathname === '/players' ? activeLinkStyle : linkStyle
              }
            >
              <span role="img" aria-label="players">
                👤
              </span>{' '}
              Players
            </Link>
            <Link
              to="/players/stats"
              style={
                location.pathname === '/players/stats'
                  ? activeLinkStyle
                  : linkStyle
              }
            >
              <span role="img" aria-label="statistics">
                📊
              </span>{' '}
              Player Stats
            </Link>
            <button
              onClick={() => {
                void logout();
              }}
              style={{
                ...linkStyle,
                backgroundColor: 'transparent',
                border: '1px solid #FF6B6B',
                color: '#FF6B6B',
                cursor: 'pointer',
              }}
            >
              <span role="img" aria-label="logout">
                🚪
              </span>{' '}
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

// HomeScreen wrapper with navigation
function NavigableHomeScreen() {
  const navigate = useNavigate();

  const handleSportPress = (sportKey: string) => {
    // Map sport keys to routes
    const routeMap: Record<string, string> = {
      football: '/football',
      baseball: '/baseball',
      basketball: '/basketball',
      hockey: '/hockey',
    };

    const route = routeMap[sportKey];
    if (route) {
      navigate(route);
    }
  };

  return <HomeScreen onSportPress={handleSportPress} />;
}

// Main App Layout
function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1E1E1E',
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {!isLoginPage && <Navigation />}
      <main style={{ padding: isLoginPage ? '0' : '2rem' }}>{children}</main>
    </div>
  );
}

export function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Simulate app initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingPanel />;
  }

  return (
    <AppLayout>
      <Routes>
        {/* Public route - login page */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes - require authentication */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <NavigableHomeScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/football"
          element={
            <ProtectedRoute>
              <FootballScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/baseball"
          element={
            <ProtectedRoute>
              <BaseballScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players"
          element={
            <ProtectedRoute>
              <PlayersScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players/stats"
          element={
            <ProtectedRoute>
              <WebPlayerStatsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players/:id"
          element={
            <ProtectedRoute>
              <WebPlayerDetailPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AppLayout>
  );
}

export default App;
