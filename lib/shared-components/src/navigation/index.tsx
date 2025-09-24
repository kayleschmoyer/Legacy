import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { ScrollView } from 'tamagui';
import { Platform } from '../platform-components';
import { NavigationConfig } from '../types';

export interface NavigationItem {
  title: string;
  route: string;
  icon?: string;
  requiresAuth?: boolean;
  divider?: boolean;
}

export interface NavigationDrawerProps {
  items: NavigationItem[];
  currentRoute: string;
  onNavigate: (route: string) => void;
  onClose?: () => void;
  userInfo?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
}

function NavigationDrawer({
  items,
  currentRoute,
  onNavigate,
  onClose,
  userInfo,
  onLogout,
}: NavigationDrawerProps) {
  const handleItemPress = (route: string) => {
    onNavigate(route);
    onClose?.();
  };

  return (
    <YStack flex={1} backgroundColor="$gray1">
      {/* Header */}
      <YStack
        padding="$4"
        backgroundColor="$blue4"
        borderBottomWidth={1}
        borderBottomColor="$gray5"
      >
        <Text fontSize="$6" fontWeight="bold" color="$gray12" marginBottom="$2">
          Legacy Sports
        </Text>
        {userInfo && (
          <YStack>
            <Text fontSize="$4" fontWeight="600" color="$gray11">
              {userInfo.name}
            </Text>
            <Text fontSize="$3" color="$gray10">
              {userInfo.email}
            </Text>
          </YStack>
        )}
      </YStack>

      {/* Navigation Items */}
      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$2">
          {items.map((item, index) => (
            <React.Fragment key={`${item.route}-${index}`}>
              {item.divider && (
                <YStack
                  height={1}
                  backgroundColor="$gray5"
                  marginVertical="$2"
                  marginHorizontal="$4"
                />
              )}

              <Button
                variant={currentRoute === item.route ? 'outlined' : 'outlined'}
                size="$4"
                justifyContent="flex-start"
                onPress={() => handleItemPress(item.route)}
                backgroundColor={
                  currentRoute === item.route ? '$blue3' : 'transparent'
                }
                borderColor={
                  currentRoute === item.route ? '$blue7' : 'transparent'
                }
                margin="$1"
                paddingHorizontal="$3"
              >
                <XStack alignItems="center" space="$3">
                  {item.icon && (
                    <Text fontSize="$5" color="$blue10">
                      {item.icon}
                    </Text>
                  )}
                  <Text
                    fontSize="$4"
                    color={currentRoute === item.route ? '$blue11' : '$gray11'}
                    fontWeight={currentRoute === item.route ? '600' : 'normal'}
                  >
                    {item.title}
                  </Text>
                </XStack>
              </Button>
            </React.Fragment>
          ))}
        </YStack>
      </ScrollView>

      {/* Footer */}
      {userInfo && onLogout && (
        <YStack padding="$4" borderTopWidth={1} borderTopColor="$gray5">
          <Button
            backgroundColor="$red9"
            onPress={onLogout}
            color="$gray1"
            fontWeight="600"
          >
            Sign Out
          </Button>
        </YStack>
      )}
    </YStack>
  );
}

/**
 * Tab Navigation Component
 */
export interface TabItem {
  title: string;
  route: string;
  icon?: string;
}

export interface TabNavigationProps {
  items: TabItem[];
  currentRoute: string;
  onNavigate: (route: string) => void;
}

function TabNavigation({
  items,
  currentRoute,
  onNavigate,
}: TabNavigationProps) {
  return (
    <XStack
      backgroundColor="$gray3"
      borderTopWidth={1}
      borderTopColor="$gray6"
      paddingVertical={Platform.OS === 'ios' ? '$5' : '$2'}
      paddingBottom={Platform.OS === 'ios' ? '$8' : '$2'} // Safe area for iOS
    >
      {items.map((item) => (
        <Button
          key={item.route}
          flex={1}
          backgroundColor={
            currentRoute === item.route ? '$blue4' : 'transparent'
          }
          borderRadius={currentRoute === item.route ? '$2' : 0}
          marginHorizontal={currentRoute === item.route ? '$1' : 0}
          paddingVertical="$2"
          borderWidth={0}
          pressStyle={{
            backgroundColor: '$gray4',
            scale: 0.98,
          }}
          onPress={() => onNavigate(item.route)}
        >
          <YStack alignItems="center" gap="$1">
            {item.icon && (
              <Text fontSize="$5" marginBottom="$1">
                {item.icon}
              </Text>
            )}
            <Text
              fontSize="$2"
              color={currentRoute === item.route ? '$blue11' : '$gray10'}
              fontWeight={currentRoute === item.route ? '600' : '400'}
            >
              {item.title}
            </Text>
          </YStack>
        </Button>
      ))}
    </XStack>
  );
}

/**
 * Breadcrumb Navigation
 */
export interface BreadcrumbItem {
  title: string;
  route?: string;
}

export interface BreadcrumbNavigationProps {
  items: BreadcrumbItem[];
  onNavigate: (route: string) => void;
}

function BreadcrumbNavigation({
  items,
  onNavigate,
}: BreadcrumbNavigationProps) {
  return (
    <XStack
      paddingHorizontal="$4"
      paddingVertical="$2"
      backgroundColor="$gray2"
      borderBottomWidth={1}
      borderBottomColor="$gray5"
      alignItems="center"
    >
      {items.map((item, index) => (
        <React.Fragment key={`${item.title}-${index}`}>
          {index > 0 && (
            <Text color="$gray9" marginHorizontal="$2" fontSize="$3">
              /
            </Text>
          )}

          {item.route ? (
            <Button
              variant="outlined"
              size="$2"
              onPress={() => item.route && onNavigate(item.route)}
              padding="$1"
              minHeight="auto"
              color="$blue10"
              fontSize="$3"
            >
              {item.title}
            </Button>
          ) : (
            <Text color="$gray12" fontSize="$3" fontWeight="600">
              {item.title}
            </Text>
          )}
        </React.Fragment>
      ))}
    </XStack>
  );
}

/**
 * Navigation Router - Simple routing logic
 */
export interface RouterProps {
  config: NavigationConfig;
  currentRoute: string;
  isAuthenticated: boolean;
  children?: React.ReactNode;
}

function Router({
  config,
  currentRoute,
  isAuthenticated,
  children,
}: RouterProps) {
  const route = config.routes.find((r) => r.path === currentRoute);

  // Redirect to auth if not authenticated and route requires auth
  if (route?.requiresAuth && !isAuthenticated) {
    const authRoute = config.routes.find((r) => r.path === config.authRoute);
    if (authRoute) {
      return <authRoute.component />;
    }
  }

  // Redirect to initial route if no route found
  if (!route) {
    const initialRoute = config.routes.find(
      (r) => r.path === config.initialRoute,
    );
    if (initialRoute) {
      return <initialRoute.component />;
    }
  }

  // Render current route
  if (route) {
    return <route.component />;
  }

  // Fallback to children
  return children;
}

/**
 * Navigation Provider - Context for navigation state
 */
export interface NavigationContextValue {
  currentRoute: string;
  navigate: (route: string) => void;
  goBack: () => void;
  canGoBack: boolean;
}

export const NavigationContext =
  React.createContext<NavigationContextValue | null>(null);

export interface NavigationProviderProps {
  children: React.ReactNode;
  initialRoute: string;
  onRouteChange?: (route: string) => void;
}

function NavigationProvider({
  children,
  initialRoute,
  onRouteChange,
}: NavigationProviderProps) {
  const [currentRoute, setCurrentRoute] = React.useState(initialRoute);
  const [history, setHistory] = React.useState<string[]>([initialRoute]);

  const navigate = React.useCallback(
    (route: string) => {
      setHistory((prev) => [...prev, route]);
      setCurrentRoute(route);
      onRouteChange?.(route);
    },
    [onRouteChange],
  );

  const goBack = React.useCallback(() => {
    if (history.length > 1) {
      const newHistory = history.slice(0, -1);
      const previousRoute = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setCurrentRoute(previousRoute);
      onRouteChange?.(previousRoute);
    }
  }, [history, onRouteChange]);

  const canGoBack = history.length > 1;

  const value: NavigationContextValue = {
    currentRoute,
    navigate,
    goBack,
    canGoBack,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Hook to use navigation context
 */
export function useNavigation(): NavigationContextValue {
  const context = React.useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

export { NavigationDrawer };
export { TabNavigation };
export { BreadcrumbNavigation };
export { Router };
export { NavigationProvider };
