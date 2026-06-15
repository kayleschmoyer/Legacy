import { Gamepad2, Home, Trophy, User, Users } from '@tamagui/lucide-icons';
import { Tabs } from 'expo-router';
import { useGetUnreadNotificationCountQuery } from '@legacy-sports/graphql';

export default function TabsLayout() {
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1B3A5C',
        tabBarInactiveTintColor: '#8A9BB0',
        tabBarStyle: {
          backgroundColor: '#f5f5f5',
          borderTopColor: '#E2E8F0',
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
