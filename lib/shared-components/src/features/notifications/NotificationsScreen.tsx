import React from 'react';
import {
  Button,
  H1,
  H2,
  H3,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Bell } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { type NotificationHistoryItem } from '@legacy-sports/graphql';
import { NotificationList } from './components/NotificationList';
import { NotificationSettings } from './components/NotificationSettings';
import { useNotifications } from './hooks/useNotifications';
import { BRAND_GOLD_LIGHT } from '../../utils/colors';

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
  onNavigateToTrades?: (leagueId: number, tradeOfferId?: number) => void;
}

export function NotificationsScreen({
  userId,
  websocketUrl,
  websocketToken,
  onNavigateToMatchup,
  onNavigateToLeague,
  onNavigateToTrades,
}: NotificationsScreenProps): React.JSX.Element {
  const {
    notifications,
    preferences,
    unreadCount,
    loading,
    error,
    updatingPreferences,
    page,
    hasNextPage,
    goToNextPage,
    goToPrevPage,
    markAsRead,
    markAllAsRead,
    updatePreferences,
    refetchHistory,
  } = useNotifications(userId, {
    websocketUrl,
    token: websocketToken,
  });

  const handleNotificationPress = (notification: NotificationHistoryItem) => {
    if (!notification.read && notification.id) {
      markAsRead(Number(notification.id)).catch((err: unknown) => {
        LOGGER.warn(
          'Failed to mark notification as read:',
          err instanceof Error ? err : String(err),
        );
      });
    }

    if (notification.matchupId && notification.leagueId) {
      onNavigateToMatchup?.(notification.matchupId, notification.leagueId);
      return;
    }

    const isTradeNotification = (notification.notificationType ?? '')
      .toLowerCase()
      .includes('trade');

    if (isTradeNotification && notification.leagueId && onNavigateToTrades) {
      onNavigateToTrades(
        notification.leagueId,
        notification.tradeOfferId ?? undefined,
      );
      return;
    }

    if (notification.leagueId) {
      onNavigateToLeague?.(notification.leagueId);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead().catch((err: unknown) => {
      LOGGER.warn(
        'Failed to mark all notifications as read:',
        err instanceof Error ? err : String(err),
      );
    });
  };

  const subtitle =
    unreadCount > 0
      ? `You have ${unreadCount} unread notification${
          unreadCount === 1 ? '' : 's'
        }`
      : '’You’re all caught up';

  let body: React.ReactNode;
  if (loading && notifications.length === 0) {
    body = (
      <YStack
        alignItems="center"
        justifyContent="center"
        gap="$3"
        paddingVertical="$10"
      >
        <Spinner size="large" />
        <Text color="$gray11">Loading notifications...</Text>
      </YStack>
    );
  } else if (error) {
    body = (
      <YStack
        alignItems="center"
        justifyContent="center"
        gap="$3"
        paddingVertical="$10"
      >
        <Bell size={40} color="$gray8" />
        <H2 fontSize="$7" color="$color" textAlign="center">
          Unable to load your notifications
        </H2>
        <Text color="$gray11" textAlign="center">
          Something went wrong while fetching your notifications. Please try
          again.
        </Text>
        <Button onPress={() => refetchHistory()}>Try again</Button>
      </YStack>
    );
  } else if (notifications.length === 0 && page === 0) {
    body = (
      <YStack
        alignItems="center"
        justifyContent="center"
        gap="$3"
        paddingVertical="$10"
      >
        <Bell size={40} color="$gray8" />
        <H2 fontSize="$7" color="$color" textAlign="center">
          No notifications yet
        </H2>
        <Text color="$gray11" textAlign="center">
          When something happens in your leagues, you{"'"} ll see it here.
        </Text>
      </YStack>
    );
  } else {
    body = (
      <YStack gap="$4">
        <NotificationList
          notifications={notifications}
          onNotificationPress={handleNotificationPress}
          onMarkAsRead={markAsRead}
        />
        <XStack
          alignItems="center"
          justifyContent="center"
          gap="$4"
          paddingVertical="$2"
        >
          <Button
            size="$3"
            disabled={page === 0}
            accessibilityLabel="Previous page"
            onPress={goToPrevPage}
          >
            Previous
          </Button>
          <Text fontSize="$3" color="$gray11">
            Page {page + 1}
          </Text>
          <Button
            size="$3"
            disabled={!hasNextPage}
            accessibilityLabel="Next page"
            onPress={goToNextPage}
          >
            Next
          </Button>
        </XStack>
      </YStack>
    );
  }

  // Responsive two-pane layout (AC2): on web the original NotificationsPage was
  // a constrained, centered column rather than a single mobile-first stripe. We
  // keep the mobile-first single column by default and, on wide viewports
  // (`$gtMd` ≈ ≥1021px), split into a ~1.15fr / 1fr two-pane layout — the
  // notification list (main) beside the preferences panel (aside) — mirroring
  // the original web grid that collapsed to one column on narrow screens. The
  // container only widens past the comfortable reading width when there is an
  // aside to place next to it, so a preferences-less view stays centered.
  const preferencesPanel = preferences ? (
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
  ) : null;

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView>
        <YStack
          width="100%"
          maxWidth={760}
          $gtMd={{ maxWidth: preferencesPanel ? 1140 : 760 }}
          alignSelf="center"
          padding="$4"
          $gtSm={{ padding: '$5' }}
          gap="$5"
        >
          <YStack gap="$2">
            <XStack
              alignItems="center"
              justifyContent="space-between"
              gap="$3"
              flexWrap="wrap"
            >
              <XStack alignItems="center" gap="$2">
                <Bell size={24} color={BRAND_GOLD_LIGHT} />
                <H1 fontSize="$9" color="$color">
                  Notifications
                </H1>
              </XStack>
              {unreadCount > 0 && (
                <Button size="$3" onPress={handleMarkAllRead}>
                  Mark all as read
                </Button>
              )}
            </XStack>
            <Text fontSize="$4" color="$gray11">
              {subtitle}
            </Text>
          </YStack>

          <YStack
            gap="$5"
            $gtMd={{ flexDirection: 'row', alignItems: 'flex-start' }}
          >
            <YStack
              gap="$5"
              $gtMd={{ flexGrow: 1.15, flexShrink: 1, flexBasis: 0 }}
            >
              {body}
            </YStack>

            {preferencesPanel && (
              <YStack
                $gtMd={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  maxWidth: 380,
                }}
              >
                {preferencesPanel}
              </YStack>
            )}
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
