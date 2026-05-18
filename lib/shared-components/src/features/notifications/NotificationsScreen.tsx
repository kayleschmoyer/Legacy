import React, { useMemo, useState } from 'react';
import {
  H3,
  ScrollView,
  Separator,
  Spinner,
  Stack,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Bell } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { NotificationList } from './components/NotificationList';
import { NotificationSettings } from './components/NotificationSettings';
import { useNotifications } from './hooks/useNotifications';
import { type NotificationHistoryItem } from '../../api/db/graphql.generated';

const BRAND_GOLD_LIGHT = '#C5A55A';

const NOTIFICATION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trades' },
  { key: 'waiver', label: 'Waivers' },
  { key: 'draft', label: 'Draft' },
  { key: 'matchup', label: 'Matchups' },
  { key: 'league', label: 'League' },
] as const;

type FilterKey = (typeof NOTIFICATION_FILTERS)[number]['key'];

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Stack
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      borderRadius="$10"
      backgroundColor={active ? BRAND_GOLD_LIGHT : '$gray3'}
      pressStyle={{ opacity: 0.7 }}
    >
      <Text
        color={active ? '$gray1' : '$gray11'}
        fontSize="$2"
        fontWeight={active ? '700' : '500'}
      >
        {label}
      </Text>
    </Stack>
  );
}

function matchesFilter(
  notification: NotificationHistoryItem,
  filter: FilterKey,
): boolean {
  if (filter === 'all') return true;
  const type = notification.notificationType?.toLowerCase() ?? '';
  return type.includes(filter);
}

export interface NotificationsScreenProps {
  userId: number;
  /**
   * WebSocket URL forwarded to `useNotifications` so the unread-count
   * badge can update in real time. Falls back to `VITE_WEBSOCKET_URL`
   * when omitted.
   */
  websocketUrl?: string;
  /**
   * Auth token for the WebSocket connection. Without a token the
   * notification-received subscription is disabled and the badge only
   * refreshes on mount.
   */
  websocketToken?: string;
  onNavigateToMatchup?: (matchupId: number, leagueId: number) => void;
  onNavigateToLeague?: (leagueId: number) => void;
}

export function NotificationsScreen({
  userId,
  websocketUrl,
  websocketToken,
  onNavigateToMatchup,
  onNavigateToLeague,
}: NotificationsScreenProps): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const {
    notifications,
    preferences,
    unreadCount,
    loading,
    updatingPreferences,
    markAsRead,
    markAllAsRead,
    updatePreferences,
  } = useNotifications(userId, {
    websocketUrl,
    token: websocketToken,
  });

  const filteredNotifications = useMemo(
    () => notifications.filter((n) => matchesFilter(n, activeFilter)),
    [notifications, activeFilter],
  );

  const handleNotificationPress = (notification: NotificationHistoryItem) => {
    if (!notification.read && notification.id) {
      markAsRead(Number(notification.id)).catch((err: unknown) => {
        LOGGER.warn(
          'Failed to mark notification as read:',
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    if (notification.matchupId && notification.leagueId) {
      onNavigateToMatchup?.(notification.matchupId, notification.leagueId);
      return;
    }

    if (notification.leagueId) {
      onNavigateToLeague?.(notification.leagueId);
    }
  };

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner size="large" />
        <Text marginTop="$3" color="$gray11">
          Loading notifications...
        </Text>
      </YStack>
    );
  }

  const listHeader = (
    <YStack
      padding="$5"
      paddingBottom="$2"
      gap="$5"
      backgroundColor="$background"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <Bell size={20} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Notifications
          </Text>
        </XStack>
        {unreadCount > 0 && (
          <XStack
            backgroundColor="$red10"
            borderRadius="$10"
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            minWidth={24}
            alignItems="center"
            justifyContent="center"
          >
            <Text
              fontSize="$2"
              fontWeight="700"
              color="white"
              textAlign="center"
            >
              {unreadCount}
            </Text>
          </XStack>
        )}
      </XStack>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {NOTIFICATION_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              active={activeFilter === f.key}
              onPress={() => setActiveFilter(f.key)}
            />
          ))}
        </XStack>
      </ScrollView>

      <YStack
        borderRadius="$6"
        borderTopLeftRadius="$6"
        borderTopRightRadius="$6"
        borderWidth={1}
        borderBottomWidth={0}
        borderColor="$borderColor"
        overflow="hidden"
      >
        <XStack
          paddingHorizontal="$5"
          paddingVertical="$4"
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <H3 color="$color">
            {activeFilter === 'all'
              ? 'All Notifications'
              : (NOTIFICATION_FILTERS.find((f) => f.key === activeFilter)
                  ?.label ?? 'Notifications')}
          </H3>
          <Text fontSize="$2" color="$textMuted">
            {filteredNotifications.length} notification
            {filteredNotifications.length !== 1 ? 's' : ''}
          </Text>
        </XStack>
      </YStack>
    </YStack>
  );

  const listFooter = (
    <YStack padding="$5" paddingTop="$2" gap="$5" backgroundColor="$background">
      <Separator />

      {preferences && (
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <H3 color="$color">Notification Preferences</H3>
          </XStack>
          <YStack padding="$4">
            <NotificationSettings
              preferences={preferences}
              onUpdate={updatePreferences}
              loading={updatingPreferences}
            />
          </YStack>
        </YStack>
      )}
    </YStack>
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      <NotificationList
        notifications={filteredNotifications}
        onNotificationPress={handleNotificationPress}
        onMarkAsRead={markAsRead}
        onMarkAllRead={markAllAsRead}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />
    </YStack>
  );
}
