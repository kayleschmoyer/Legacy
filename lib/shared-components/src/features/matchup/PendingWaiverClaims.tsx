import React, { useCallback, useEffect, useState } from 'react';
import { Card, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { Clock } from '@tamagui/lucide-icons/icons/Clock';
import { Trash2 } from '@tamagui/lucide-icons/icons/Trash2';
import { X } from '@tamagui/lucide-icons/icons/X';
import { LOGGER } from '@legacy-sports/logging';
import { waiverProcessingScheduleCopy } from '@legacy-sports/utils';
import {
  useCancelWaiverClaimMutation,
  useGetTeamWaiverClaimsQuery,
  useGetTeamWaiverPriorityQuery,
} from '@legacy-sports/graphql';
import { Button } from '../../Button';

/** "1st" / "2nd" / "3rd" / "4th" — used only for the waiver priority badge. */
function formatOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface PendingWaiverClaimsProps {
  teamId: number;
  /**
   * Optional callback invoked with the component's internal `refetch` so a
   * caller (e.g. a pull-to-refresh gesture, LS-8862) can trigger a refresh
   * from outside. Mirrors `TradingCenter`'s `onSubscribeRefresh` — return an
   * optional cleanup function.
   */
  onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * PendingWaiverClaims — Shows pending waiver claims for a team with cancel
 * functionality. Self-contained: fetches its own data via GraphQL.
 * Cross-platform (Tamagui).
 */
export function PendingWaiverClaims({
  teamId,
  onSubscribeRefresh,
}: PendingWaiverClaimsProps) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useGetTeamWaiverClaimsQuery({
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  // Rolling-waiver priority (e.g. "3rd of 12") — null for FAAB leagues, where
  // there is no priority order to show (LS-6312 / FLD-029).
  const { data: priorityData } = useGetTeamWaiverPriorityQuery({
    variables: { teamId },
  });
  const waiverPriority = priorityData?.teamWaiverPriority;

  useEffect(() => {
    if (!onSubscribeRefresh) return;
    const cleanup = onSubscribeRefresh(() => {
      void refetch();
    });
    return cleanup ?? undefined;
  }, [onSubscribeRefresh, refetch]);

  const [cancelClaim] = useCancelWaiverClaimMutation();

  const handleCancel = useCallback(
    async (claimId: number) => {
      setCancellingId(claimId);
      setActionError(null);
      try {
        await cancelClaim({ variables: { claimId } });
        await refetch();
      } catch (err) {
        LOGGER.error('Failed to cancel waiver claim:', String(err));
        setActionError('Failed to cancel waiver claim. Please try again.');
      } finally {
        setCancellingId(null);
      }
    },
    [cancelClaim, refetch],
  );

  const claims = data?.teamWaiverClaims ?? [];

  if (!loading && !error && claims.length === 0) return null;

  return (
    <Card
      backgroundColor="$background"
      borderColor="$amber7"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
    >
      <YStack>
        {/* Header */}
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          backgroundColor="$amber2"
          borderBottomWidth={1}
          borderBottomColor="$amber6"
        >
          <Clock size={16} color="$amber9" />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$amber9"
            textTransform="uppercase"
            letterSpacing={0.8}
            flex={1}
          >
            Pending Waiver Claims
          </Text>
          {waiverPriority?.waiverType === 'standard' &&
            waiverPriority.priority != null &&
            waiverPriority.totalTeams != null && (
              <Text
                fontSize={10}
                fontWeight="700"
                color="$amber10"
                backgroundColor="$amber3"
                paddingHorizontal="$1.5"
                paddingVertical={1}
                borderRadius="$1"
                testID="waiver-priority-badge"
              >
                Priority: {formatOrdinal(waiverPriority.priority)} of{' '}
                {waiverPriority.totalTeams}
              </Text>
            )}
          {loading && <Spinner size="small" color="$amber9" />}
        </XStack>

        {error && (
          <XStack
            backgroundColor="$red3"
            borderRadius="$2"
            padding="$2"
            marginHorizontal="$3"
            marginTop="$2"
            alignItems="center"
            gap="$2"
          >
            <AlertTriangle size={14} color="$red10" />
            <Text fontSize="$2" color="$red10">
              Failed to load waiver claims
            </Text>
          </XStack>
        )}

        {actionError && (
          <XStack
            backgroundColor="$red3"
            borderRadius="$2"
            padding="$2"
            marginHorizontal="$3"
            marginTop="$2"
            alignItems="center"
            gap="$2"
          >
            <AlertTriangle size={14} color="$red10" />
            <Text fontSize="$2" color="$red10">
              {actionError}
            </Text>
          </XStack>
        )}

        {claims.map((claim, index) => (
          <React.Fragment key={claim.id ?? index}>
            <XStack
              paddingVertical="$2.5"
              paddingHorizontal="$3"
              alignItems="center"
              justifyContent="space-between"
              gap="$3"
            >
              <YStack flex={1} gap="$0.5" minWidth={0}>
                <Text fontWeight="600" fontSize="$3" numberOfLines={1}>
                  {claim.playerName ?? `Player #${claim.playerId}`}
                </Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  {claim.dropPlayerId != null && (
                    <XStack alignItems="center" gap="$0.5">
                      <X size={10} color="$red9" />
                      <Text fontSize={10} color="$red9" fontWeight="600">
                        Drop:{' '}
                        {claim.dropPlayerName ??
                          `Player #${claim.dropPlayerId}`}
                      </Text>
                    </XStack>
                  )}
                  {claim.faabBid != null && claim.faabBid > 0 && (
                    <Text
                      fontSize={10}
                      color="$amber10"
                      fontWeight="700"
                      backgroundColor="$amber3"
                      paddingHorizontal="$1"
                      paddingVertical={1}
                      borderRadius="$1"
                    >
                      ${claim.faabBid} FAAB
                    </Text>
                  )}
                  <Text fontSize={10} color="$gray9">
                    {claim.createdAt ? formatDate(claim.createdAt) : ''}
                  </Text>
                </XStack>
              </YStack>

              <Button
                size="$2"
                variant="outlined"
                theme="red"
                onPress={() => {
                  if (claim.id != null) void handleCancel(claim.id);
                }}
                disabled={cancellingId === claim.id || claim.id == null}
                icon={
                  cancellingId === claim.id ? (
                    <Spinner size="small" />
                  ) : (
                    <Trash2 size={12} color="$red10" />
                  )
                }
              >
                <Text fontSize="$1" fontWeight="600">
                  {cancellingId === claim.id ? 'Cancelling' : 'Cancel'}
                </Text>
              </Button>
            </XStack>
            {index < claims.length - 1 && <Separator />}
          </React.Fragment>
        ))}

        {claims.length > 0 && (
          <XStack
            paddingVertical="$2"
            paddingHorizontal="$3"
            borderTopWidth={1}
            borderTopColor="$gray4"
            justifyContent="center"
          >
            <Text fontSize="$1" color="$gray9" textAlign="center">
              {claims.length} pending claim{claims.length !== 1 ? 's' : ''} —{' '}
              {waiverProcessingScheduleCopy()}
            </Text>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}
