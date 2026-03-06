import { useCallback, useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetNotificationHistoryQuery,
  useGetUnreadNotificationCountQuery,
  useGetUserNotificationPreferencesQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationAsReadMutation,
  useUpdateNotificationPreferencesMutation,
} from '../../../api/db/graphql.generated';

/**
 * Hook for managing user notification preferences and history
 *
 * Note: GraphQL codegen produces types that ESLint marks as `any` in some contexts,
 * but they are actually type-safe at runtime. File-level eslint-disable used for
 * GraphQL type safety warnings.
 */
export function useNotifications(userId: number) {
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

  // Fetch unread count
  const { data: countData, refetch: refetchCount } =
    useGetUnreadNotificationCountQuery({
      skip: !userId,
      pollInterval: 30000, // Poll every 30 seconds
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
    async (input: Record<string, unknown>) => {
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
