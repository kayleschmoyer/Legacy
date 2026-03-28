import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  Check,
  CircleDollarSign,
  DollarSign,
  X as XIcon,
} from '@tamagui/lucide-icons';
import {
  useGetLeagueDuesStatusQuery,
  useMarkMemberPaidMutation,
  useMarkMemberUnpaidMutation,
} from '../../api/db/graphql.generated';
import { AlertTriangle } from '@tamagui/lucide-icons';
import {
  BRAND_NAVY_LIGHT,
  GREEN,
  RED,
  withAlpha,
} from '../../constants/colors';

export interface LeagueDuesStatusDashboardProps {
  leagueId: number;
  isCommissioner: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

type SortKey = 'username' | 'paid' | 'paidAt';
type SortDirection = 'asc' | 'desc';
type FilterMode = 'all' | 'paid' | 'unpaid';

export function LeagueDuesStatusDashboard({
  leagueId,
  isCommissioner,
  onSuccess,
  onError,
}: LeagueDuesStatusDashboardProps) {
  const { data, loading, error } = useGetLeagueDuesStatusQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });

  const [markPaid, { loading: markingPaid }] = useMarkMemberPaidMutation();
  const [markUnpaid, { loading: markingUnpaid }] =
    useMarkMemberUnpaidMutation();
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('username');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState<FilterMode>('all');

  const settings = data?.leagueDuesSettings;
  const members = useMemo(() => data?.leagueDuesStatus ?? [], [data]);

  const amountDollars = settings?.amountCents
    ? (settings.amountCents / 100).toFixed(2)
    : '0.00';

  const filteredAndSorted = useMemo(() => {
    let filtered = [...members];

    if (filter === 'paid') {
      filtered = filtered.filter((m) => m.paid);
    } else if (filter === 'unpaid') {
      filtered = filtered.filter((m) => !m.paid);
    }

    filtered.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'username':
          return (
            dir *
            (a.username ?? '').localeCompare(b.username ?? '', undefined, {
              sensitivity: 'base',
            })
          );
        case 'paid': {
          const aVal = a.paid ? 1 : 0;
          const bVal = b.paid ? 1 : 0;
          return dir * (aVal - bVal);
        }
        case 'paidAt': {
          const aTime = a.paidAt ? new Date(a.paidAt).getTime() : 0;
          const bTime = b.paidAt ? new Date(b.paidAt).getTime() : 0;
          return dir * (aTime - bTime);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [members, filter, sortKey, sortDirection]);

  const paidCount = members.filter((m) => m.paid).length;
  const unpaidCount = members.length - paidCount;
  const collectedCents = paidCount * (settings?.amountCents ?? 0);
  const collectedDollars = (collectedCents / 100).toFixed(2);

  const handleToggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection('asc');
      }
    },
    [sortKey],
  );

  const handleTogglePaid = useCallback(
    async (userId: number, currentlyPaid: boolean) => {
      setTogglingUserId(userId);
      try {
        if (currentlyPaid) {
          await markUnpaid({
            variables: { leagueId, userId },
            refetchQueries: ['GetLeagueDuesStatus'],
            awaitRefetchQueries: true,
          });
          onSuccess?.('Member marked as unpaid');
        } else {
          await markPaid({
            variables: { leagueId, userId },
            refetchQueries: ['GetLeagueDuesStatus'],
            awaitRefetchQueries: true,
          });
          onSuccess?.('Member marked as paid');
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to update payment';
        onError?.(new Error(msg));
      } finally {
        setTogglingUserId(null);
      }
    },
    [leagueId, markPaid, markUnpaid, onSuccess, onError],
  );

  const mutating = markingPaid || markingUnpaid;

  // Query error — render error state and notify parent
  if (error && !data) {
    onError?.(error);
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$red8"
        padding="$5"
        borderWidth={1}
        borderRadius="$4"
      >
        <XStack alignItems="center" gap="$3">
          <AlertTriangle size={20} color="$red10" />
          <Text color="$red10">Failed to load dues status</Text>
        </XStack>
      </Card>
    );
  }

  // Don't show dashboard when dues are not enabled
  if (!loading && (!settings || !settings.enabled)) {
    return null;
  }

  if (loading && !data) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <YStack gap="$3" alignItems="center">
          <Spinner size="large" />
          <Text color="$textMuted">Loading dues status...</Text>
        </YStack>
      </Card>
    );
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <CircleDollarSign size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4>League Dues</H4>
            <Text fontSize="$2" color="$gray10">
              {`$${amountDollars} per member`}
            </Text>
          </YStack>
        </XStack>

        {/* Summary Stats */}
        <XStack gap="$3" flexWrap="wrap">
          <Card
            flex={1}
            minWidth={120}
            padding="$3"
            borderRadius="$4"
            backgroundColor={withAlpha(GREEN, 0.1)}
            borderColor={withAlpha(GREEN, 0.3)}
            borderWidth={1}
          >
            <YStack alignItems="center" gap="$1">
              <Text fontSize="$6" fontWeight="800" color="$green10">
                {paidCount}
              </Text>
              <Text fontSize="$2" color="$gray10">
                Paid
              </Text>
            </YStack>
          </Card>
          <Card
            flex={1}
            minWidth={120}
            padding="$3"
            borderRadius="$4"
            backgroundColor={withAlpha(RED, 0.1)}
            borderColor={withAlpha(RED, 0.3)}
            borderWidth={1}
          >
            <YStack alignItems="center" gap="$1">
              <Text fontSize="$6" fontWeight="800" color="$red10">
                {unpaidCount}
              </Text>
              <Text fontSize="$2" color="$gray10">
                Unpaid
              </Text>
            </YStack>
          </Card>
          <Card
            flex={1}
            minWidth={120}
            padding="$3"
            borderRadius="$4"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.1)}
            borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
            borderWidth={1}
          >
            <YStack alignItems="center" gap="$1">
              <XStack alignItems="center" gap="$1">
                <DollarSign size={16} color={BRAND_NAVY_LIGHT} />
                <Text fontSize="$6" fontWeight="800" color={BRAND_NAVY_LIGHT}>
                  {collectedDollars}
                </Text>
              </XStack>
              <Text fontSize="$2" color="$gray10">
                Collected
              </Text>
            </YStack>
          </Card>
        </XStack>

        <Separator />

        {/* Filter Buttons */}
        <XStack gap="$2" flexWrap="wrap">
          {(['all', 'paid', 'unpaid'] as const).map((mode) => {
            const isActive = filter === mode;
            const label =
              mode === 'all'
                ? `All (${members.length})`
                : mode === 'paid'
                  ? `Paid (${paidCount})`
                  : `Unpaid (${unpaidCount})`;
            return (
              <Button
                key={mode}
                size="$2"
                theme={isActive ? 'active' : 'alt2'}
                backgroundColor={
                  isActive ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
                }
                borderColor={isActive ? BRAND_NAVY_LIGHT : '$gray6'}
                borderWidth={1}
                borderRadius="$3"
                onPress={() => setFilter(mode)}
              >
                <Text
                  fontSize="$2"
                  fontWeight={isActive ? '700' : '400'}
                  color={isActive ? 'white' : '$color'}
                >
                  {label}
                </Text>
              </Button>
            );
          })}
        </XStack>

        {/* Table Header */}
        <XStack
          padding="$2"
          paddingHorizontal="$3"
          borderRadius="$3"
          backgroundColor="$gray3"
        >
          <XStack
            flex={2}
            cursor="pointer"
            onPress={() => handleToggleSort('username')}
          >
            <Text fontSize="$2" fontWeight="700" color="$gray11">
              {`Member${sortIndicator('username')}`}
            </Text>
          </XStack>
          <XStack
            flex={1}
            justifyContent="center"
            cursor="pointer"
            onPress={() => handleToggleSort('paid')}
          >
            <Text fontSize="$2" fontWeight="700" color="$gray11">
              {`Status${sortIndicator('paid')}`}
            </Text>
          </XStack>
          <XStack
            flex={1}
            justifyContent="center"
            cursor="pointer"
            onPress={() => handleToggleSort('paidAt')}
            display="none"
            $gtSm={{ display: 'flex' }}
          >
            <Text fontSize="$2" fontWeight="700" color="$gray11">
              {`Date Paid${sortIndicator('paidAt')}`}
            </Text>
          </XStack>
          {isCommissioner && (
            <XStack flex={1} justifyContent="flex-end">
              <Text fontSize="$2" fontWeight="700" color="$gray11">
                Action
              </Text>
            </XStack>
          )}
        </XStack>

        {/* Member Rows */}
        <YStack gap="$1">
          {filteredAndSorted.map((member, idx) => {
            const isToggling = togglingUserId === member.userId;
            const paidDate = member.paidAt
              ? new Date(member.paidAt).toLocaleDateString()
              : '\u2014';

            return (
              <XStack
                key={member.userId}
                padding="$2"
                paddingHorizontal="$3"
                borderRadius="$3"
                backgroundColor={idx % 2 === 0 ? '$color1' : 'transparent'}
                alignItems="center"
              >
                {/* Username */}
                <XStack flex={2} alignItems="center" gap="$2">
                  <Text
                    fontSize="$3"
                    fontWeight="500"
                    color="$color"
                    numberOfLines={1}
                  >
                    {member.username ?? `User ${member.userId}`}
                  </Text>
                </XStack>

                {/* Status Badge */}
                <XStack flex={1} justifyContent="center">
                  <XStack
                    alignItems="center"
                    gap="$1"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$10"
                    backgroundColor={
                      member.paid
                        ? withAlpha('#22c55e', 0.15)
                        : withAlpha('#ef4444', 0.15)
                    }
                  >
                    {member.paid ? (
                      <Check size={12} color="$green10" />
                    ) : (
                      <XIcon size={12} color="$red10" />
                    )}
                    <Text
                      fontSize="$2"
                      fontWeight="600"
                      color={member.paid ? '$green10' : '$red10'}
                    >
                      {member.paid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </XStack>
                </XStack>

                {/* Date Paid (hidden on small screens) */}
                <XStack
                  flex={1}
                  justifyContent="center"
                  display="none"
                  $gtSm={{ display: 'flex' }}
                >
                  <Text fontSize="$2" color="$gray10">
                    {paidDate}
                  </Text>
                </XStack>

                {/* Commissioner Action */}
                {isCommissioner && (
                  <XStack flex={1} justifyContent="flex-end">
                    <Button
                      size="$2"
                      theme={member.paid ? 'alt2' : 'green'}
                      disabled={mutating || member.userId == null}
                      onPress={() => {
                        if (member.userId == null) {
                          onError?.(
                            new Error(
                              'Cannot toggle dues status: missing userId for member.',
                            ),
                          );
                          return;
                        }
                        void handleTogglePaid(
                          member.userId,
                          member.paid ?? false,
                        );
                      }}
                      opacity={mutating && !isToggling ? 0.5 : 1}
                      icon={
                        isToggling ? (
                          <Spinner size="small" />
                        ) : member.paid ? (
                          <XIcon size={14} />
                        ) : (
                          <Check size={14} />
                        )
                      }
                    >
                      <Text fontSize="$1">
                        {member.paid ? 'Mark Unpaid' : 'Mark Paid'}
                      </Text>
                    </Button>
                  </XStack>
                )}
              </XStack>
            );
          })}

          {filteredAndSorted.length === 0 && (
            <YStack padding="$4" alignItems="center">
              <Text color="$gray10" fontSize="$3">
                {filter === 'all'
                  ? 'No league members found'
                  : `No ${filter} members`}
              </Text>
            </YStack>
          )}
        </YStack>
      </YStack>
    </Card>
  );
}
