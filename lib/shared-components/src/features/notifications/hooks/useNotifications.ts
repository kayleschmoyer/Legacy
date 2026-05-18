import { useCallback, useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type NotificationPreferenceInput,
  useGetNotificationHistoryQuery,
  useGetUnreadNotificationCountQuery,
  useGetUserNotificationPreferencesQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationAsReadMutation,
  useUpdateNotificationPreferencesMutation,
} from '../../../api/db/graphql.generated';
import { useWebSocket } from '../../../hooks/useWebSocket';

export interface UseNotificationsOptions {
  /**
   * WebSocket URL for the notification-received subscription. When omitted
   * the hook falls back to `process.env.VITE_WEBSOCKET_URL` via `useWebSocket`.
   */
  websocketUrl?: string;
  /**
   * Auth token used by the WebSocket connection. Without a token the hook
   * skips the WebSocket subscription — the unread count will only refresh
   * on mount / on explicit `refetch()`.
   */
  token?: string;
}

/**
 * Hook for managing user notification preferences and history.
 *
 * The unread-count badge is driven by a WebSocket `notification-received`
 * push from the notifications Lambda — there is no polling. Callers must
 * pass a `token` (and optionally `websocketUrl`) for the badge to update
 * in real time; without a token the count refreshes only on mount.
 */
export function useNotifications(
  userId: number,
  { websocketUrl, token }: UseNotificationsOptions = {},
) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notification preferences
  const {
    data: preferencesData,
    loading: preferencesLoading,
    refetch: refetchPreferences,
  } = useGetUserNotificationPreferencesQuery({
    skip: !userId,
  });

  // Fetch notification history
  const {
    data: historyData,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useGetNotificationHistoryQuery({
    variables: { limit: 50 },
    skip: !userId,
  });

  // Fetch unread count — pushed via WebSocket, no polling
  const { data: countData, refetch: refetchCount } =
    useGetUnreadNotificationCountQuery({
      skip: !userId,
    });

  // Update unread count when data changes
  useEffect(() => {
    if (
      countData?.getUnreadNotificationCount !== undefined &&
      countData.getUnreadNotificationCount !== null
    ) {
      setUnreadCount(countData.getUnreadNotificationCount);
    }
  }, [countData]);

  // Subscribe to WebSocket pushes so the badge updates within ~1s when a
  // new in-app notification lands. Refetch both the unread count and the
  // notification history so the bell list and badge stay in sync.
  useWebSocket({
    url: websocketUrl,
    token,
    viewContext: 'general',
    autoConnect: !!userId && !!token,
    onNotificationReceived: () => {
      void refetchCount();
      void refetchHistory();
    },
  });

  // Update notification preferences mutation
  const [updatePreferencesMutation, { loading: updatingPreferences }] =
    useUpdateNotificationPreferencesMutation({
      onCompleted: () => {
        void refetchPreferences();
      },
    });

  // Mark notification as read mutation
  const [markAsReadMutation] = useMarkNotificationAsReadMutation({
    onCompleted: () => {
      void refetchHistory();
      void refetchCount();
    },
  });

  // Mark all notifications as read mutation
  const [markAllAsReadMutation] = useMarkAllNotificationsAsReadMutation({
    onCompleted: () => {
      void refetchHistory();
      void refetchCount();
    },
  });

  // Helper functions
  const updatePreferences = useCallback(
    async (input: NotificationPreferenceInput) => {
      try {
        await updatePreferencesMutation({
          variables: {
            input,
          },
        });
      } catch (error) {
        LOGGER.error('Error updating notification preferences:', String(error));
        throw error;
      }
    },
    [updatePreferencesMutation],
  );

  const markAsRead = useCallback(
    async (notificationId: number) => {
      try {
        await markAsReadMutation({
          variables: { notificationId },
        });
      } catch (error) {
        LOGGER.error('Error marking notification as read:', String(error));
        throw error;
      }
    },
    [markAsReadMutation],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation();
    } catch (error) {
      LOGGER.error('Error marking all notifications as read:', String(error));
      throw error;
    }
  }, [markAllAsReadMutation]);

  return {
    preferences: preferencesData?.getUserNotificationPreferences,

    notifications: historyData?.getNotificationHistory || [],
    unreadCount,
    loading: preferencesLoading || historyLoading,
    updatingPreferences,
    updatePreferences,
    markAsRead,
    markAllAsRead,
    refetch: () => {
      void refetchPreferences();
      void refetchHistory();
      void refetchCount();
    },
  };
}
