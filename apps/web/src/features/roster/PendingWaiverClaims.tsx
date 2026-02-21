import React, { useCallback, useState } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components';
import { Card, H5, Separator, Spinner, Text } from 'tamagui';
import { AlertTriangle, Clock, Trash2, X } from '@tamagui/lucide-icons';
import {
  useCancelWaiverClaimMutation,
  useGetTeamWaiverClaimsQuery,
} from '../../api/db/graphql.generated';

interface PendingWaiverClaimsProps {
  teamId: number;
}

export function PendingWaiverClaims({ teamId }: PendingWaiverClaimsProps) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { data, loading, error, refetch } = useGetTeamWaiverClaimsQuery({
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  const [cancelClaim] = useCancelWaiverClaimMutation();

  const handleCancel = useCallback(
    async (claimId: number) => {
      setCancellingId(claimId);
      try {
        await cancelClaim({
          variables: { claimId },
        });
        await refetch();
      } catch (err) {
        // Error is displayed via Apollo error state
        console.error('Failed to cancel waiver claim:', err);
      } finally {
        setCancellingId(null);
      }
    },
    [cancelClaim, refetch],
  );

  const claims = data?.teamWaiverClaims ?? [];

  // Don't render anything if no pending claims and not loading
  if (!loading && claims.length === 0) {
    return null;
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <Card
      bordered
      padding="$4"
      backgroundColor="$background"
      borderColor="$yellow6"
      borderWidth={1}
      elevate
    >
      <YStack gap="$3">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <Clock size={18} color="$yellow10" />
          <H5 color="$yellow10" margin={0}>
            Pending Waiver Claims
          </H5>
          {loading && <Spinner size="small" color="$yellow10" />}
        </XStack>

        <Separator borderColor="$yellow6" />

        {error && (
          <XStack
            backgroundColor="$red3"
            borderRadius="$2"
            padding="$2"
            alignItems="center"
            gap="$2"
          >
            <AlertTriangle size={14} color="$red10" />
            <Text fontSize="$2" color="$red10">
              Failed to load waiver claims
            </Text>
          </XStack>
        )}

        {/* Claims list */}
        {claims.map((claim) => (
          <Card
            key={claim.id}
            bordered
            padding="$3"
            backgroundColor="$yellow2"
            borderColor="$yellow5"
            borderRadius="$3"
          >
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              {/* Claim details */}
              <YStack flex={1} gap="$1">
                <XStack alignItems="center" gap="$2">
                  <Text fontWeight="600" fontSize="$4" color="$color">
                    {claim.playerName ?? `Player #${claim.playerId}`}
                  </Text>
                </XStack>
                {claim.dropPlayerId && (
                  <XStack alignItems="center" gap="$1">
                    <X size={12} color="$red9" />
                    <Text fontSize="$2" color="$red9">
                      Dropping:{' '}
                      {claim.dropPlayerName ?? `Player #${claim.dropPlayerId}`}
                    </Text>
                  </XStack>
                )}
                {claim.faabBid != null && claim.faabBid > 0 && (
                  <Text fontSize="$2" color="$blue10" fontWeight="600">
                    FAAB Bid: ${claim.faabBid}
                  </Text>
                )}
                <Text fontSize="$1" color="$colorSubtle">
                  Submitted{' '}
                  {claim.createdAt ? formatDate(claim.createdAt) : 'Unknown'}
                </Text>
              </YStack>

              {/* Cancel button */}
              <Button
                size="$3"
                backgroundColor="$red4"
                borderColor="$red7"
                borderWidth={1}
                hoverStyle={{ backgroundColor: '$red5' }}
                pressStyle={{ backgroundColor: '$red6' }}
                onPress={() => {
                  if (claim.id != null) void handleCancel(claim.id);
                }}
                disabled={cancellingId === claim.id || claim.id == null}
                aria-label={`Cancel waiver claim for ${claim.playerName ?? 'player'}`}
                icon={
                  cancellingId === claim.id ? (
                    <Spinner size="small" />
                  ) : (
                    <Trash2 size={14} color="$red10" />
                  )
                }
              >
                <Text fontSize="$2" color="$red10">
                  {cancellingId === claim.id ? 'Cancelling…' : 'Cancel'}
                </Text>
              </Button>
            </XStack>
          </Card>
        ))}

        {/* Summary footer */}
        {claims.length > 0 && (
          <Text fontSize="$1" color="$colorSubtle" textAlign="center">
            {claims.length} pending claim{claims.length !== 1 ? 's' : ''} —
            processed hourly
          </Text>
        )}
      </YStack>
    </Card>
  );
}
