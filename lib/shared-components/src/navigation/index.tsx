import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from '../platform-components';
import { Route, NavigationConfig } from '../types';
import { DEFAULT_COLORS } from '../config/sports';

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

export function NavigationDrawer({
  items,
  currentRoute,
  onNavigate,
  onClose,
  userInfo,
  onLogout,
}: NavigationDrawerProps): JSX.Element {
  const handleItemPress = (route: string) => {
    onNavigate(route);
    onClose?.();
  };

  return (
    <View style={styles.drawerContainer}>
      {/* Header */}
      <View style={styles.drawerHeader}>
        <Text style={styles.appTitle}>Legacy Sports</Text>
        {userInfo && (
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{userInfo.name}</Text>
            <Text style={styles.userEmail}>{userInfo.email}</Text>
          </View>
        )}
      </View>

      {/* Navigation Items */}
      <ScrollView style={styles.navItems}>
        {items.map((item, index) => (
          <React.Fragment key={`${item.route}-${index}`}>
            {item.divider && <View style={styles.divider} />}

            <TouchableOpacity
              style={[
                styles.navItem,
                currentRoute === item.route && styles.navItemActive,
              ]}
              onPress={() => handleItemPress(item.route)}
            >
              {item.icon && <Text style={styles.navIcon}>{item.icon}</Text>}
              <Text
                style={[
                  styles.navText,
                  currentRoute === item.route && styles.navTextActive,
                ]}
              >
                {item.title}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Footer */}
      {userInfo && onLogout && (
        <View style={styles.drawerFooter}>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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

export function TabNavigation({
  items,
  currentRoute,
  onNavigate,
}: TabNavigationProps): JSX.Element {
  return (
    <View style={styles.tabContainer}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={[
            styles.tabItem,
            currentRoute === item.route && styles.tabItemActive,
          ]}
          onPress={() => onNavigate(item.route)}
        >
          {item.icon && <Text style={styles.tabIcon}>{item.icon}</Text>}
          <Text
            style={[
              styles.tabText,
              currentRoute === item.route && styles.tabTextActive,
            ]}
          >
            {item.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
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

export function BreadcrumbNavigation({
  items,
  onNavigate,
}: BreadcrumbNavigationProps): JSX.Element {
  return (
    <View style={styles.breadcrumbContainer}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.title}-${index}`}>
          {index > 0 && <Text style={styles.breadcrumbSeparator}>/</Text>}

          {item.route ? (
            <TouchableOpacity onPress={() => onNavigate(item.route!)}>
              <Text style={styles.breadcrumbLink}>{item.title}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.breadcrumbText}>{item.title}</Text>
          )}
        </React.Fragment>
      ))}
    </View>
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

export function Router({
  config,
  currentRoute,
  isAuthenticated,
  children,
}: RouterProps): JSX.Element {
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
  return <>{children}</>;
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

export function NavigationProvider({
  children,
  initialRoute,
  onRouteChange,
}: NavigationProviderProps): JSX.Element {
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

const styles = StyleSheet.create({
  // Drawer Styles
  drawerContainer: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.secondary,
  },
  drawerHeader: {
    padding: 20,
    backgroundColor: DEFAULT_COLORS.accent,
    borderBottomWidth: 1,
    borderBottomColor: DEFAULT_COLORS.border,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
  },
  userInfo: {
    marginTop: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: DEFAULT_COLORS.text,
  },
  userEmail: {
    fontSize: 12,
    color: DEFAULT_COLORS.text,
    opacity: 0.8,
  },
  navItems: {
    flex: 1,
    paddingVertical: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navItemActive: {
    backgroundColor: DEFAULT_COLORS.primary,
  },
  navIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  navText: {
    fontSize: 16,
    color: DEFAULT_COLORS.textSecondary,
    flex: 1,
  },
  navTextActive: {
    color: DEFAULT_COLORS.accent,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: DEFAULT_COLORS.border,
    marginVertical: 8,
    marginHorizontal: 20,
  },
  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: DEFAULT_COLORS.border,
  },
  logoutButton: {
    backgroundColor: DEFAULT_COLORS.error,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },

  // Tab Styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: DEFAULT_COLORS.secondary,
    borderTopWidth: 1,
    borderTopColor: DEFAULT_COLORS.border,
    paddingVertical: Platform.OS === 'ios' ? 20 : 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 8, // Safe area for iOS
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabItemActive: {
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabText: {
    fontSize: 12,
    color: DEFAULT_COLORS.textSecondary,
  },
  tabTextActive: {
    color: DEFAULT_COLORS.accent,
    fontWeight: '600',
  },

  // Breadcrumb Styles
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: DEFAULT_COLORS.secondary,
    borderBottomWidth: 1,
    borderBottomColor: DEFAULT_COLORS.border,
  },
  breadcrumbSeparator: {
    color: DEFAULT_COLORS.textSecondary,
    marginHorizontal: 8,
  },
  breadcrumbLink: {
    color: DEFAULT_COLORS.accent,
    fontSize: 14,
    textDecorationLine: Platform.OS === 'web' ? 'underline' : undefined,
  },
  breadcrumbText: {
    color: DEFAULT_COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
