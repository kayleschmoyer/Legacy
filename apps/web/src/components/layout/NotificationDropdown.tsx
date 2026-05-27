import type { GestureResponderEvent } from 'react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Button, Spinner, styled } from 'tamagui';
import { Bell, CheckCheck, Eye } from '@tamagui/lucide-icons';
import { DROPDOWN_BORDER, NAV_DROPDOWN_ANIMATION } from './NavDropdownShared';
import {
  GetNotificationHistory,
  type GetNotificationHistoryQuery,
  type GetNotificationHistoryQueryVariables,
  GetUnreadNotificationCount,
  type GetUnreadNotificationCountQuery,
  useGetNotificationHistoryQuery,
  useGetUnreadNotificationCountQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationAsReadMutation,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, BRAND_SEAM_RED } from '../../constants/colors';
import { formatTimeAgo } from '../../utils/formatTimeAgo';

const TriggerButton = styled(Button, {
  size: '$3',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$10',
  paddingHorizontal: '$2',
  position: 'relative',
  hoverStyle: { backgroundColor: '$color3' },
  pressStyle: { backgroundColor: '$color4', scale: 0.97 },
});

const BadgeContainer = styled(YStack, {
  position: 'absolute',
  top: -2,
  right: -2,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 4,
});

const DropdownContent = styled(YStack, {
  backgroundColor: '$color2',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '$borderColor',
  minWidth: 360,
  maxWidth: 400,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.5,
  shadowRadius: 36,
  elevation: 14,
  overflow: 'hidden',
});

const DropdownHeader = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
});

const NotificationItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: 0,
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  width: '100%',
  hoverStyle: { backgroundColor: '$color2' },
  pressStyle: { backgroundColor: '$color3' },
  variants: {
    unread: {
      true: { backgroundColor: '$color1' },
    },
  } as const,
});

const DropdownFooter = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  alignItems: 'center',
  justifyContent: 'center',
  borderTopWidth: 1,
  borderTopColor: '$borderColor',
});

export const NotificationDropdown: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonId = 'notification-menu-button';
  const menuId = 'notification-menu';

  const { data: countData } = useGetUnreadNotificationCountQuery({
    skip: !isAuthenticated,
    pollInterval: 30000,
  });
  const { data: historyData, loading } = useGetNotificationHistoryQuery({
    skip: !isAuthenticated || !isOpen,
    variables: { limit: 10, offset: 0 },
    fetchPolicy: 'cache-and-network',
  });
  const [markAsRead] = useMarkNotificationAsReadMutation();
  const [markAllAsRead] = useMarkAllNotificationsAsReadMutation();

  const unreadCount = countData?.getUnreadNotificationCount ?? 0;
  const notifications = historyData?.getNotificationHistory ?? [];

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      const btn = document.getElementById(buttonId);
      btn?.focus();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const menu = document.getElementById(menuId);
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      if (items.length === 0) return;
      const currentIndex = items.findIndex(
        (el) =>
          el === document.activeElement || el.contains(document.activeElement),
      );
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus();
    }
  };

  const handleMarkAsRead = useCallback(
    (notificationId: number) => {
      void markAsRead({
        variables: { notificationId },
        refetchQueries: [
          'GetNotificationHistory',
          'GetUnreadNotificationCount',
        ],
      });
    },
    [markAsRead],
  );

  const handleMarkAllAsRead = useCallback(() => {
    const now = new Date().toISOString();
    void markAllAsRead({
      optimisticResponse: { markAllNotificationsAsRead: true },
      update(cache) {
        cache.writeQuery<GetUnreadNotificationCountQuery>({
          query: GetUnreadNotificationCount,
          data: { getUnreadNotificationCount: 0 },
        });
        const history = cache.readQuery<
          GetNotificationHistoryQuery,
          GetNotificationHistoryQueryVariables
        >({
          query: GetNotificationHistory,
          variables: { limit: 10, offset: 0 },
        });
        if (history?.getNotificationHistory) {
          cache.writeQuery<
            GetNotificationHistoryQuery,
            GetNotificationHistoryQueryVariables
          >({
            query: GetNotificationHistory,
            variables: { limit: 10, offset: 0 },
            data: {
              getNotificationHistory: history.getNotificationHistory.map((n) =>
                n?.read ? n : { ...n, read: true, readAt: now },
              ),
            },
          });
        }
      },
      refetchQueries: ['GetNotificationHistory', 'GetUnreadNotificationCount'],
    });
  }, [markAllAsRead]);

  if (!isAuthenticated) return null;

  return (
    <YStack position="relative" ref={dropdownRef} onKeyDown={onKeyDown}>
      <TriggerButton
        onPress={() => setIsOpen(!isOpen)}
        id={buttonId}
        data-testid="notifications-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <BadgeContainer backgroundColor={BRAND_SEAM_RED}>
            <Paragraph
              fontSize={10}
              lineHeight={12}
              fontWeight="700"
              color="white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Paragraph>
          </BadgeContainer>
        )}
      </TriggerButton>

      {isOpen && (
        <DropdownContent
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          zIndex={100}
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
          style={{
            borderColor: DROPDOWN_BORDER,
            animation: NAV_DROPDOWN_ANIMATION,
          }}
        >
          <DropdownHeader>
            <Paragraph size="$4" fontWeight="600" color="$color">
              Notifications
            </Paragraph>
            {unreadCount > 0 && (
              <Button
                size="$2"
                backgroundColor="transparent"
                borderWidth={0}
                data-testid="notifications-mark-all-read"
                onPress={handleMarkAllAsRead}
                paddingHorizontal="$2"
                hoverStyle={{ backgroundColor: '$color3' }}
              >
                <XStack alignItems="center" gap="$1">
                  <CheckCheck size={14} color="$colorPress" />
                  <Paragraph size="$2" color="$colorPress">
                    Mark all read
                  </Paragraph>
                </XStack>
              </Button>
            )}
          </DropdownHeader>

          <YStack maxHeight={400} overflowY="auto">
            {loading && notifications.length === 0 ? (
              <XStack justifyContent="center" padding="$6">
                <Spinner size="small" />
              </XStack>
            ) : notifications.length === 0 ? (
              <YStack padding="$6" alignItems="center" gap="$2">
                <Bell size={24} color="$colorPress" />
                <Paragraph size="$3" color="$colorPress">
                  No notifications yet
                </Paragraph>
              </YStack>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  unread={!notification.read}
                  role="menuitem"
                  data-testid={`notification-item-${notification.id}`}
                  onPress={() => {
                    if (!notification.read && notification.id != null) {
                      handleMarkAsRead(notification.id);
                    }
                  }}
                >
                  <XStack flex={1} gap="$3" alignItems="flex-start">
                    <YStack
                      width={8}
                      height={8}
                      borderRadius={4}
                      backgroundColor={
                        notification.read ? 'transparent' : BRAND_NAVY_LIGHT
                      }
                      marginTop={6}
                      flexShrink={0}
                    />
                    <YStack flex={1} gap="$1">
                      <Paragraph
                        size="$3"
                        fontWeight={notification.read ? '400' : '600'}
                        color="$color"
                        numberOfLines={1}
                      >
                        {notification.title}
                      </Paragraph>
                      <Paragraph
                        size="$2"
                        color="$colorPress"
                        numberOfLines={2}
                      >
                        {notification.message}
                      </Paragraph>
                      <Paragraph size="$1" color="$colorPress">
                        {notification.sentAt
                          ? formatTimeAgo(notification.sentAt)
                          : ''}
                      </Paragraph>
                    </YStack>
                    {!notification.read && notification.id != null && (
                      <Button
                        size="$1"
                        backgroundColor="transparent"
                        borderWidth={0}
                        data-testid={`notification-mark-read-${notification.id}`}
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          if (notification.id != null) {
                            handleMarkAsRead(notification.id);
                          }
                        }}
                        hoverStyle={{ backgroundColor: '$color3' }}
                        paddingHorizontal="$1"
                        aria-label="Mark as read"
                      >
                        <Eye size={14} color="$colorPress" />
                      </Button>
                    )}
                  </XStack>
                </NotificationItem>
              ))
            )}
          </YStack>

          <DropdownFooter>
            <Link
              to="/notifications"
              style={{ textDecoration: 'none' }}
              onClick={() => setIsOpen(false)}
            >
              <Paragraph
                size="$3"
                color={BRAND_NAVY_LIGHT}
                fontWeight="500"
                hoverStyle={{ opacity: 0.8 }}
              >
                See all notifications
              </Paragraph>
            </Link>
          </DropdownFooter>
        </DropdownContent>
      )}
    </YStack>
  );
};
