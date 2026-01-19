/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import React from 'react';
import { FlatList, type GestureResponderEvent } from 'react-native';
import { Button, Card, Circle, H6, Text, XStack, YStack } from 'tamagui';
import { Bell, Check } from '@tamagui/lucide-icons';
import { type NotificationHistoryItem } from '../../../api/db/graphql.generated';

export interface NotificationListProps {
  notifications: NotificationHistoryItem[];
  onNotificationPress?: (notification: NotificationHistoryItem) => void;
  onMarkAsRead?: (notificationId: number) => Promise<void>;
  onMarkAllRead?: () => Promise<void>;
  loading?: boolean;
}

/**
 * NotificationList - Displays a list of notifications
 * Shows notification history with read/unread status
 */
export function NotificationList({
  notifications,
  onNotificationPress,
  onMarkAsRead,
  onMarkAllRead,
  loading = false,
}: NotificationListProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: NotificationHistoryItem }) => (
    <Card
      elevate
      size="$3"
      bordered
      backgroundColor={item.read ? '$gray1' : '$blue2'}
      pressStyle={{ scale: 0.98 }}
      onPress={() => onNotificationPress?.(item)}
      animation="bouncy"
      margin="$2"
    >
      <YStack padding="$3" space="$2">
        <XStack justifyContent="space-between" alignItems="flex-start">
          <XStack flex={1} space="$2" alignItems="center">
            <Bell size="$1" color={item.read ? '$gray11' : '$blue10'} />
            <YStack flex={1}>
              <H6>{item.title}</H6>
              <Text fontSize="$2" color="$gray11" numberOfLines={2}>
                {item.message}
              </Text>
            </YStack>
          </XStack>
          {!item.read && (
            <Circle size="$1" backgroundColor="$blue10" marginLeft="$2" />
          )}
        </XStack>

        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$1" color="$gray11">
            {formatTime(item.sentAt ?? '')}
          </Text>
          {!item.read && onMarkAsRead && item.id && (
            <Button
              size="$2"
              icon={Check}
              onPress={async (e: GestureResponderEvent) => {
                e.stopPropagation();
                if (item.id) await onMarkAsRead(Number(item.id));
              }}
              chromeless
            >
              Mark as read
            </Button>
          )}
        </XStack>
      </YStack>
    </Card>
  );

  if (notifications.length === 0) {
    return (
      <YStack padding="$4" alignItems="center" justifyContent="center" space="$2">
        <Bell size="$4" color="$gray10" />
        <Text fontSize="$4" color="$gray11">
          No notifications
        </Text>
        <Text fontSize="$2" color="$gray10" textAlign="center">
          You'll see notifications here when you receive them
        </Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      {unreadCount > 0 && onMarkAllRead && (
        <XStack
          padding="$3"
          justifyContent="space-between"
          alignItems="center"
          backgroundColor="$gray2"
        >
          <Text fontSize="$3" fontWeight="600">
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <Button
            size="$3"
            onPress={onMarkAllRead}
            disabled={loading}
            chromeless
          >
            Mark all as read
          </Button>
        </XStack>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id?.toString() ?? ''}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </YStack>
  );
}
