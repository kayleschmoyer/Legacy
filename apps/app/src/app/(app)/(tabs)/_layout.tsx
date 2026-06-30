import { Gamepad2, Home, Trophy, User, Users } from '@tamagui/lucide-icons';
import { Tabs } from 'expo-router';
import { useGetUnreadNotificationCountQuery } from '@legacy-sports/graphql';
import { useThemeContext } from '../../../context/ThemeContext';

const TAB_COLORS = {
  dark: {
    bg: '#0A0F1A',
    border: '#1E2D45',
    active: '#DEE6FF',
  },
  light: {
    bg: '#f5f5f5',
    border: '#E2E8F0',
    active: '#1B3A5C',
  },
} as const;

export default function TabsLayout() {
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;
  const { resolvedTheme } = useThemeContext();
  const tabColors = TAB_COLORS[resolvedTheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabColors.active,
        tabBarInactiveTintColor: '#8A9BB0',
        tabBarStyle: {
          backgroundColor: tabColors.bg,
          borderTopColor: tabColors.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
        // expo-router defaults allowFontScaling=false on iOS 13+ (LS-7573).
        // Explicitly re-enable so Dynamic Type / Android font scaling is respected.
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color, size }) => (
            <Gamepad2 color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
