import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Check, X as XIcon } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetLeagueDuesStatusQuery,
  useMarkMemberPaidMutation,
  useMarkMemberUnpaidMutation,
} from '../../api/db/graphql.generated';

export interface LeagueDuesPaymentStatusProps {
  leagueId: number;
  isCommissioner: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

type FilterMode = 'all' | 'paid' | 'unpaid';

export function LeagueDuesPaymentStatus({
  leagueId,
  isCommissioner,
  onSuccess,
  onError,
}: LeagueDuesPaymentStatusProps) {
  const { data, loading } = useGetLeagueDuesStatusQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });

  const [markPaid, { loading: markingPaid }] = useMarkMemberPaidMutation();
  const [markUnpaid, { loading: markingUnpaid }] =
    useMarkMemberUnpaidMutation();
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  const settings = data?.leagueDuesSettings;
  const members = useMemo(() => data?.leagueDuesStatus ?? [], [data]);

  const amountDollars = settings?.amountCents
    ? (settings.amountCents / 100).toFixed(2)
    : '0.00';

  const paidCount = members.filter((m) => m.paid).length;
  const unpaidCount = members.length - paidCount;
  const collectedDollars = (
    (paidCount * (settings?.amountCents ?? 0)) /
    100
  ).toFixed(2);

  const filtered = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      (a.username ?? '').localeCompare(b.username ?? '', undefined, {
        sensitivity: 'base',
      }),
    );
    if (filter === 'paid') return sorted.filter((m) => m.paid);
    if (filter === 'unpaid') return sorted.filter((m) => !m.paid);
    return sorted;
  }, [members, filter]);

  const handleTogglePaid = useCallback(
    async (userId: number, currentlyPaid: boolean) => {
      if (!userId) {
        LOGGER.error('togglePaid called with missing userId', { userId });
        return;
      }
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
        LOGGER.error('Failed to toggle payment status', { err });
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

  // Don't render when dues are not enabled
  if (!loading && (!settings || !settings.enabled)) {
    return null;
  }

  if (loading && !data) {
    return (
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3" alignItems="center">
          <Spinner size="large" />
          <Text color="$gray10">Loading payment status...</Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
      <YStack space="$4">
        {/* Header */}
        <YStack>
          <Text fontSize="$5" fontWeight="600" color="$blue11">
            Payment Status
          </Text>
          <Text color="$gray11" fontSize="$3">
            {`$${amountDollars} per member`}
          </Text>
        </YStack>

        {/* Summary Stats */}
        <XStack space="$3">
          <YStack
            flex={1}
            alignItems="center"
            padding="$2"
            borderRadius="$3"
            backgroundColor="$green3"
          >
            <Text fontSize="$6" fontWeight="800" color="$green11">
              {paidCount}
            </Text>
            <Text fontSize="$1" color="$gray10">
              Paid
            </Text>
          </YStack>
          <YStack
            flex={1}
            alignItems="center"
            padding="$2"
            borderRadius="$3"
            backgroundColor="$red3"
          >
            <Text fontSize="$6" fontWeight="800" color="$red11">
              {unpaidCount}
            </Text>
            <Text fontSize="$1" color="$gray10">
              Unpaid
            </Text>
          </YStack>
          <YStack
            flex={1}
            alignItems="center"
            padding="$2"
            borderRadius="$3"
            backgroundColor="$blue3"
          >
            <Text fontSize="$6" fontWeight="800" color="$blue11">
              {`$${collectedDollars}`}
            </Text>
            <Text fontSize="$1" color="$gray10">
              Collected
            </Text>
          </YStack>
        </XStack>

        <Separator />

        {/* Filter Buttons */}
        <XStack space="$2">
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
                flex={1}
                backgroundColor={isActive ? '$blue9' : '$gray4'}
                borderColor={isActive ? '$blue10' : '$gray6'}
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

        {/* Member List */}
        <YStack space="$2">
          {filtered.map((member) => {
            const isToggling = togglingUserId === member.userId;
            const paidDate = member.paidAt
              ? new Date(member.paidAt).toLocaleDateString()
              : null;

            return (
              <XStack
                key={member.userId}
                alignItems="center"
                padding="$3"
                borderRadius="$3"
                backgroundColor={member.paid ? '$green2' : '$gray2'}
                borderWidth={1}
                borderColor={member.paid ? '$green6' : '$gray5'}
              >
                {/* Status icon + name */}
                <XStack flex={1} alignItems="center" space="$2">
                  <YStack
                    width={28}
                    height={28}
                    borderRadius={14}
                    backgroundColor={member.paid ? '$green9' : '$red9'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {member.paid ? (
                      <Check size={16} color="white" />
                    ) : (
                      <XIcon size={16} color="white" />
                    )}
                  </YStack>
                  <YStack flex={1}>
                    <Text fontSize="$3" fontWeight="500">
                      {member.username ?? `User ${member.userId}`}
                    </Text>
                    {paidDate && (
                      <Text fontSize="$1" color="$gray10">
                        {`Paid ${paidDate}`}
                      </Text>
                    )}
                  </YStack>
                </XStack>

                {/* Commissioner toggle */}
                {isCommissioner && (
                  <Button
                    size="$2"
                    backgroundColor={member.paid ? '$gray5' : '$green9'}
                    borderRadius="$3"
                    onPress={() =>
                      void handleTogglePaid(
                        member.userId ?? 0,
                        member.paid ?? false,
                      )
                    }
                    disabled={mutating || !member.userId}
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
                    pressStyle={{ opacity: 0.8 }}
                  >
                    <Text
                      fontSize="$1"
                      color={member.paid ? '$color' : 'white'}
                    >
                      {member.paid ? 'Unpaid' : 'Paid'}
                    </Text>
                  </Button>
                )}
              </XStack>
            );
          })}

          {filtered.length === 0 && (
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
