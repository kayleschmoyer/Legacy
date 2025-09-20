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
import { Platform } from '../platform-components';

// Logger setup with fallback
let LOGGER: {
  warn: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      warn: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    warn: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.warn(...args);
    },
  };
}

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
          headerStyle: { backgroundColor: '#1E1E1E' },
          headerTintColor: '#FFFFFF',
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
            drawerStyle: { backgroundColor: '#2A2A2A' },
            drawerActiveTintColor: '#3366FF',
            drawerInactiveTintColor: '#CCCCCC',
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
    LOGGER.warn('React Navigation not available:', error);

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
          backgroundColor: '#1E1E1E',
          padding: '1rem',
          borderBottom: '1px solid #333',
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
              color: '#FFFFFF',
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            Fantasy Sports Hub
          </h1>
          <div style={{ display: 'flex', gap: '1rem', marginLeft: '2rem' }}>
            {routes.map((route) => (
              <Link
                key={route.name}
                to={route.path || `/${route.name.toLowerCase()}`}
                style={{
                  color:
                    location.pathname ===
                    (route.path || `/${route.name.toLowerCase()}`)
                      ? '#3366FF'
                      : '#CCCCCC',
                  textDecoration: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  backgroundColor:
                    location.pathname ===
                    (route.path || `/${route.name.toLowerCase()}`)
                      ? 'rgba(51, 102, 255, 0.1)'
                      : 'transparent',
                }}
              >
                {route.title}
              </Link>
            ))}
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
    LOGGER.warn('React Router not available:', error);

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
