import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { Platform } from '../platform-components';
import { BG_DARK, BLUE, SURFACE_CARD, TEXT_PRIMARY } from '../utils/colors';

// React Navigation screen options and plain HTML inline styles cannot consume
// Tamagui's $token syntax. For native, we reference the shared dark-theme
// design-token constants (the app defaults to dark mode). For web, CSS custom
// properties (set by TamaguiProvider) give full theme awareness.
const NATIVE_COLORS = {
  headerBg: BG_DARK, // $background
  headerTint: TEXT_PRIMARY, // $color
  drawerBg: SURFACE_CARD, // $color3
  activeAccent: BLUE, // $blue9
  mutedText: '#6C80BA', // $color10 — no shared constant yet
} as const;

export interface NavigationRoute {
  name: string;
  component: React.ComponentType;
  title: string;
  path?: string; // For web routing
  icon?: string;
  isProtected?: boolean; // Requires authentication
}

export interface TamaguiAppNavigatorProps {
  routes: NavigationRoute[];
  initialRoute?: string;
  isAuthenticated?: boolean;
  fallbackComponent?: React.ComponentType;
}

/**
 * Cross-platform navigation setup using either React Navigation (mobile) or React Router (web)
 */
function TamaguiAppNavigator({
  routes,
  initialRoute,
  isAuthenticated = false,
  fallbackComponent: FallbackComponent,
}: TamaguiAppNavigatorProps) {
  // Filter routes based on authentication status
  const availableRoutes = routes.filter(
    (route) => !route.isProtected || isAuthenticated,
  );

  if (Platform.OS === 'web') {
    return <WebNavigator routes={availableRoutes} />;
  }

  return (
    <NativeNavigator
      routes={availableRoutes}
      initialRoute={initialRoute}
      fallbackComponent={FallbackComponent}
    />
  );
}

// React Native Navigation
function NativeNavigator({
  routes,
  initialRoute,
  fallbackComponent: FallbackComponent,
}: {
  routes: NavigationRoute[];
  initialRoute?: string;
  fallbackComponent?: React.ComponentType;
}) {
  // Move function declaration outside try block
  function AppStack() {
    const Stack = createStackNavigator();
    return (
      <Stack.Navigator
        initialRouteName={initialRoute || routes[0]?.name}
        screenOptions={{
          headerStyle: { backgroundColor: NATIVE_COLORS.headerBg },
          headerTintColor: NATIVE_COLORS.headerTint,
        }}
      >
        {routes.map((route) => (
          <Stack.Screen
            key={route.name}
            name={route.name}
            component={route.component}
            options={{ title: route.title }}
          />
        ))}
      </Stack.Navigator>
    );
  }

  try {
    const Drawer = createDrawerNavigator();

    return (
      <NavigationContainer>
        <Drawer.Navigator
          screenOptions={{
            drawerStyle: { backgroundColor: NATIVE_COLORS.drawerBg },
            drawerActiveTintColor: NATIVE_COLORS.activeAccent,
            drawerInactiveTintColor: NATIVE_COLORS.mutedText,
          }}
        >
          <Drawer.Screen
            name="MainStack"
            component={AppStack}
            options={{ title: 'Fantasy Sports Hub' }}
          />
        </Drawer.Navigator>
      </NavigationContainer>
    );
  } catch (error) {
    LOGGER.warn('React Navigation not available:', String(error));

    if (FallbackComponent) {
      return <FallbackComponent />;
    }

    // Fallback: render first available route
    const FirstRoute = routes[0]?.component;
    return FirstRoute ? <FirstRoute /> : <div>Navigation not available</div>;
  }
}

// Web Navigation (React Router)
function WebNavigator({ routes }: { routes: NavigationRoute[] }) {
  // Move function declaration outside try block
  function NavBar() {
    const location = useLocation();

    return (
      <nav
        style={{
          backgroundColor: `var(--background, ${BG_DARK})`,
          padding: '1rem',
          borderBottom: `1px solid var(--borderColor, #2F3B53)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <h1
            style={{
              color: `var(--color, ${TEXT_PRIMARY})`,
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            Fantasy Sports Hub
          </h1>
          <div style={{ display: 'flex', gap: '1rem', marginLeft: '2rem' }}>
            {routes.map((route) => {
              const isActive =
                location.pathname ===
                (route.path || `/${route.name.toLowerCase()}`);
              return (
                <Link
                  key={route.name}
                  to={route.path || `/${route.name.toLowerCase()}`}
                  style={{
                    color: isActive
                      ? `var(--blue9, ${BLUE})`
                      : 'var(--color10, #6C80BA)',
                    textDecoration: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    backgroundColor: isActive
                      ? 'var(--blue3, #12316B)'
                      : 'transparent',
                  }}
                >
                  {route.title}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  try {
    return (
      <BrowserRouter>
        <NavBar />
        <main style={{ padding: '2rem' }}>
          <Routes>
            {routes.map((route) => {
              const Component = route.component;
              return (
                <Route
                  key={route.name}
                  path={route.path || `/${route.name.toLowerCase()}`}
                  element={<Component />}
                />
              );
            })}
            {/* Default route */}
            {routes.length > 0 && (
              <Route
                path="/"
                element={React.createElement(routes[0].component)}
              />
            )}
          </Routes>
        </main>
      </BrowserRouter>
    );
  } catch (error) {
    LOGGER.warn('React Router not available:', String(error));

    // Fallback: render first available route
    const FirstRoute = routes[0]?.component;
    return FirstRoute ? (
      <FirstRoute />
    ) : (
      <div>Web navigation not available</div>
    );
  }
}

export { TamaguiAppNavigator };
export { NativeNavigator };
export { WebNavigator };
export default TamaguiAppNavigator;
