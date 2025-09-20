import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Platform } from './platform-components';

export interface NavigationRoute {
  name: string;
  component: React.ComponentType;
  title: string;
  path?: string; // For web routing
}

interface AppNavigatorProps {
  routes: NavigationRoute[];
  initialRoute?: string;
}

// React Native Navigation
const NativeNavigator = ({ routes, initialRoute }: AppNavigatorProps) => {
  const Drawer = createDrawerNavigator();
  const Stack = createStackNavigator();

  function AppStack() {
    return (
      <Stack.Navigator
        initialRouteName={initialRoute}
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
};

// Web Navigation (React Router)
const WebNavigator = ({ routes, initialRoute }: AppNavigatorProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Create a nav bar for web
  const NavBar = () => (
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
            <button
              key={route.name}
              onClick={() =>
                navigate(route.path || `/${route.name.toLowerCase()}`)
              }
              style={{
                backgroundColor:
                  location.pathname ===
                  (route.path || `/${route.name.toLowerCase()}`)
                    ? '#3366FF'
                    : 'transparent',
                color: '#FFFFFF',
                border: '1px solid #3366FF',
                borderRadius: '4px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                if (
                  location.pathname !==
                  (route.path || `/${route.name.toLowerCase()}`)
                ) {
                  e.currentTarget.style.backgroundColor = '#254EDB';
                }
              }}
              onMouseOut={(e) => {
                if (
                  location.pathname !==
                  (route.path || `/${route.name.toLowerCase()}`)
                ) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {route.title}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );

  return (
    <div>
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
    </div>
  );
};

function AppNavigator(props: AppNavigatorProps) {
  if (Platform.OS === 'web') {
    return <WebNavigator {...props} />;
  }
  return <NativeNavigator {...props} />;
}

export { AppNavigator };
