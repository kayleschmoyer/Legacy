import type { GestureResponderEvent } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  H1,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Button, ScrollView, Spinner, styled } from 'tamagui';
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
} from '@tamagui/lucide-icons';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';
import {
  useGetNotificationHistoryQuery,
  useGetUnreadNotificationCountQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationAsReadMutation,
} from '../../api/db/graphql.generated';
import { formatTimeAgo } from '../../utils/formatTimeAgo';

/* ─── Constants ─── */

const PAGE_SIZE = 20;

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$4',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$3',
  },
});

const PageHeader = styled(XStack, {
  paddingVertical: '$8',
  alignItems: 'center',
  justifyContent: 'space-between',
  $sm: {
    paddingVertical: '$6',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$3',
  },
});

const NotificationCard = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: '$background',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$5',
  paddingHorizontal: '$4',
  paddingVertical: '$4',
  width: '100%',
  hoverStyle: { backgroundColor: '$color2' },
  pressStyle: { backgroundColor: '$color3' },
  variants: {
    unread: {
      true: {
        borderLeftWidth: 3,
        borderLeftColor: BRAND_NAVY_LIGHT,
      },
    },
  } as const,
});

/* ─── Helpers ─── */

function getPageBackgroundStyle(isDark: boolean): React.CSSProperties {
  return {
    background: isDark
      ? `
          radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.16)} 0%, transparent 50%),
          radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.06)} 0%, transparent 45%)
        `
      : `
          radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.06)} 0%, transparent 50%),
          radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.04)} 0%, transparent 45%)
        `,
    backgroundAttachment: 'fixed',
  };
}

/* ─── Main Component ─── */

const NotificationsPage: React.FC = () => {
  const { resolvedTheme } = useThemeContext();
  const isDark = resolvedTheme === 'dark';
  const pageBackgroundStyle = useMemo(
    () => getPageBackgroundStyle(isDark),
    [isDark],
  );

  const [page, setPage] = useState(0);

  const { data, loading } = useGetNotificationHistoryQuery({
    variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
  });
  const { data: countData } = useGetUnreadNotificationCountQuery();
  const [markAsRead] = useMarkNotificationAsReadMutation();
  const [markAllAsRead] = useMarkAllNotificationsAsReadMutation();

  const notifications = data?.getNotificationHistory ?? [];
  const unreadCount = countData?.getUnreadNotificationCount ?? 0;
  const hasNextPage = notifications.length === PAGE_SIZE;
  const hasPreviousPage = page > 0;

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
    void markAllAsRead({
      refetchQueries: ['GetNotificationHistory', 'GetUnreadNotificationCount'],
    });
  }, [markAllAsRead]);

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Notifications"
        description="View and manage your Legacy Sports notifications."
      />
      <ScrollView>
        <ContentContainer>
          <PageHeader>
            <YStack gap="$2">
              <H1
                style={{
                  fontSize: 32,
                  fontWeight: '700',
                  color: isDark ? BRAND_GOLD_LIGHT : BRAND_NAVY,
                  letterSpacing: -0.5,
                }}
              >
                Notifications
              </H1>
              <Paragraph size="$4" color="$colorPress">
                {unreadCount > 0
                  ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                  : 'You are all caught up'}
              </Paragraph>
            </YStack>
            {unreadCount > 0 && (
              <Button
                size="$3"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                onPress={handleMarkAllAsRead}
                hoverStyle={{ backgroundColor: '$color3' }}
                pressStyle={{ backgroundColor: '$color4' }}
              >
                <XStack alignItems="center" gap="$2">
                  <CheckCheck size={16} />
                  <Paragraph size="$3" fontWeight="500">
                    Mark all as read
                  </Paragraph>
                </XStack>
              </Button>
            )}
          </PageHeader>

          {loading && notifications.length === 0 ? (
            <XStack justifyContent="center" padding="$8">
              <Spinner
                size="large"
                color={isDark ? BRAND_GOLD_LIGHT : BRAND_NAVY}
              />
            </XStack>
          ) : notifications.length === 0 && page === 0 ? (
            <YStack
              padding="$10"
              alignItems="center"
              gap="$4"
              borderRadius="$6"
              borderWidth={1}
              borderColor="$borderColor"
              backgroundColor="$background"
            >
              <Bell size={40} color="$colorPress" />
              <YStack alignItems="center" gap="$2">
                <Paragraph size="$5" fontWeight="600" color="$color">
                  No notifications yet
                </Paragraph>
                <Paragraph size="$3" color="$colorPress" textAlign="center">
                  When you receive notifications about matchups, drafts, and
                  league activity, they will appear here.
                </Paragraph>
              </YStack>
            </YStack>
          ) : (
            <YStack gap="$2">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  unread={!notification.read}
                  onPress={() => {
                    if (!notification.read && notification.id != null) {
                      handleMarkAsRead(notification.id);
                    }
                  }}
                >
                  <XStack flex={1} gap="$3" alignItems="flex-start">
                    <YStack
                      width={10}
                      height={10}
                      borderRadius={5}
                      backgroundColor={
                        notification.read ? 'transparent' : BRAND_NAVY_LIGHT
                      }
                      marginTop={5}
                      flexShrink={0}
                    />
                    <YStack flex={1} gap="$1">
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Paragraph
                          size="$4"
                          fontWeight={notification.read ? '400' : '600'}
                          color="$color"
                        >
                          {notification.title}
                        </Paragraph>
                        <Paragraph size="$2" color="$colorPress" flexShrink={0}>
                          {notification.sentAt
                            ? formatTimeAgo(notification.sentAt)
                            : ''}
                        </Paragraph>
                      </XStack>
                      <Paragraph size="$3" color="$colorPress">
                        {notification.message}
                      </Paragraph>
                    </YStack>
                    {!notification.read && notification.id != null && (
                      <Button
                        size="$2"
                        backgroundColor="transparent"
                        borderWidth={0}
                        onPress={(event: GestureResponderEvent) => {
                          event.stopPropagation();
                          if (notification.id != null) {
                            handleMarkAsRead(notification.id);
                          }
                        }}
                        hoverStyle={{ backgroundColor: '$color3' }}
                        paddingHorizontal="$2"
                        aria-label="Mark as read"
                      >
                        <Eye size={16} color="$colorPress" />
                      </Button>
                    )}
                  </XStack>
                </NotificationCard>
              ))}

              {/* Pagination controls */}
              <XStack
                justifyContent="center"
                alignItems="center"
                gap="$3"
                paddingVertical="$4"
              >
                <Button
                  size="$3"
                  backgroundColor="$color2"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderRadius="$4"
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={!hasPreviousPage}
                  opacity={hasPreviousPage ? 1 : 0.4}
                  hoverStyle={{ backgroundColor: '$color3' }}
                  pressStyle={{ backgroundColor: '$color4' }}
                >
                  <XStack alignItems="center" gap="$1">
                    <ChevronLeft size={16} />
                    <Paragraph size="$3">Previous</Paragraph>
                  </XStack>
                </Button>
                <Paragraph size="$3" color="$colorPress">
                  Page {page + 1}
                </Paragraph>
                <Button
                  size="$3"
                  backgroundColor="$color2"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderRadius="$4"
                  onPress={() => setPage((p) => p + 1)}
                  disabled={!hasNextPage}
                  opacity={hasNextPage ? 1 : 0.4}
                  hoverStyle={{ backgroundColor: '$color3' }}
                  pressStyle={{ backgroundColor: '$color4' }}
                >
                  <XStack alignItems="center" gap="$1">
                    <Paragraph size="$3">Next</Paragraph>
                    <ChevronRight size={16} />
                  </XStack>
                </Button>
              </XStack>
            </YStack>
          )}
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

export default NotificationsPage;
