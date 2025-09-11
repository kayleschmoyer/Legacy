import React, { useEffect, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
// Note: shared-components import removed as it's not available in this context

import {
  BaseballScreen,
  DemoScreen,
  DraftBoardScreen,
  FootballScreen,
  HomeScreen,
  PlayersScreen,
} from '../components/screens';

import { LoadingPanel } from '../components/LoadingPanel';

// Simple Navigation Component
function Navigation() {
  const location = useLocation();

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
          <span role="img" aria-label="Football">🏈</span> Fantasy Sports Hub
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link
            to="/"
            style={location.pathname === '/' ? activeLinkStyle : linkStyle}
          >
            <span role="img" aria-label="Home">🏠</span> Home
          </Link>
          <Link
            to="/football"
            style={
              location.pathname === '/football' ? activeLinkStyle : linkStyle
            }
          >
            <span role="img" aria-label="Football">🏈</span> Football
          </Link>
          <Link
            to="/baseball"
            style={
              location.pathname === '/baseball' ? activeLinkStyle : linkStyle
            }
          >
            <span role="img" aria-label="Baseball">⚾</span> Baseball
          </Link>
          <Link
            to="/players"
            style={
              location.pathname === '/players' ? activeLinkStyle : linkStyle
            }
          >
            <span role="img" aria-label="Players">👥</span> Players
          </Link>
          <Link
            to="/demo"
            style={location.pathname === '/demo' ? activeLinkStyle : linkStyle}
          >
            <span role="img" aria-label="Demo">🎨</span> Demo
          </Link>
          <Link
            to="/draftboard"
            style={location.pathname === '/draftboard' ? activeLinkStyle : linkStyle}
          >
            <span role="img" aria-label="Draftboard">📋</span> Draft Board
          </Link>
        </div>
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

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return <HomeScreen onSportPress={handleSportPress} onNavigate={handleNavigate} />;
}

// Main App Layout
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1E1E1E',
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <Navigation />
      <main style={{ padding: '2rem' }}>{children}</main>
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
        <Route path="/" element={<NavigableHomeScreen />} />
        <Route path="/football" element={<FootballScreen />} />
        <Route path="/baseball" element={<BaseballScreen />} />
        <Route path="/players" element={<PlayersScreen />} />
        <Route path="/demo" element={<DemoScreen />} />
        <Route path="/draftboard" element={<DraftBoardScreen />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
