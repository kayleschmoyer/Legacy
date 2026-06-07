import React from 'react';
import { type GestureResponderEvent } from 'react-native';
import { Button, Card, Circle, H3, Text, XStack, YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { type NotificationHistoryItem } from '../../../api/db/graphql.generated';

export interface NotificationListProps {
  notifications: NotificationHistoryItem[];
  onNotificationPress?: (notification: NotificationHistoryItem) => void;
  onMarkAsRead?: (notificationId: number) => Promise<void>;
}

function formatTimeAgo(timestamp: string): string {
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
}

/**
 * Renders the paginated notification cards. Each card's title is an `H3`
 * (semantic heading) so screen readers and tests can target individual
 * notifications by their title. Empty / loading / pagination chrome is owned
 * by `NotificationsScreen`.
 */
export function NotificationList({
  notifications,
  onNotificationPress,
  onMarkAsRead,
}: NotificationListProps) {
  return (
    <YStack gap="$3">
      {notifications.map((item, index) => (
        <Card
          key={item.id?.toString() ?? `item-${index}`}
          elevate
          size="$3"
          bordered
          backgroundColor={item.read ? '$background' : '$blue2'}
          pressStyle={{ scale: 0.985 }}
          onPress={() => onNotificationPress?.(item)}
          animation="bouncy"
          accessibilityLabel={`${item.read ? 'Read' : 'Unread'} notification: ${
            item.title ?? 'Notification'
          }. ${item.message ?? ''}`.trim()}
        >
          <YStack padding="$4" gap="$2">
            <XStack
              justifyContent="space-between"
              alignItems="flex-start"
              gap="$3"
            >
              <YStack flex={1} gap="$1">
                <H3
                  fontSize="$6"
                  fontWeight={item.read ? '600' : '800'}
                  color="$color"
                >
                  {item.title}
                </H3>
                <Text fontSize="$3" color="$gray11" numberOfLines={3}>
                  {item.message}
                </Text>
              </YStack>
              {!item.read && (
                <Circle
                  size={10}
                  backgroundColor="$blue10"
                  marginTop="$2"
                  marginLeft="$2"
                />
              )}
            </XStack>

            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize="$2" color="$gray10">
                {item.sentAt ? formatTimeAgo(item.sentAt) : 'Unknown time'}
              </Text>
              {!item.read && onMarkAsRead && item.id != null && (
                <Button
                  size="$2"
                  icon={Check}
                  chromeless
                  accessibilityLabel={`Mark "${item.title}" as read`}
                  onPress={(e: GestureResponderEvent) => {
                    e.stopPropagation();
                    if (item.id != null) void onMarkAsRead(Number(item.id));
                  }}
                >
                  Mark as read
                </Button>
              )}
            </XStack>
          </YStack>
        </Card>
      ))}
    </YStack>
  );
}
