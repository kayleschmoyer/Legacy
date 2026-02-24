import React, { useCallback, useState } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components';
import { Card, Separator, Spinner, Text } from 'tamagui';
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

  // Don't render until we've received at least one response (prevents flash on load)
  if (!data) return null;

  // Don't render if there are no pending claims
  if (claims.length === 0) {
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
      backgroundColor="rgba(17, 27, 47, 0.7)"
      borderColor="$amber7"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 0 20px rgba(245, 158, 11, 0.08)',
      }}
    >
      <YStack>
        {/* Gradient accent bar */}
        <YStack
          height={2}
          width="100%"
          style={{
            background: 'linear-gradient(90deg, #F59E0B, #FBBF24, transparent)',
          }}
        />
        {/* Header */}
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          backgroundColor="rgba(245, 158, 11, 0.08)"
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

        {/* Claims list */}
        {claims.map((claim, index) => (
          <React.Fragment key={claim.id}>
            <XStack
              paddingVertical="$2.5"
              paddingHorizontal="$3"
              alignItems="center"
              justifyContent="space-between"
              gap="$3"
              animation="quick"
              hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
              pressStyle={{ scale: 0.995, opacity: 0.9 }}
            >
              {/* Claim details */}
              <YStack flex={1} gap="$0.5" minWidth={0}>
                <Text
                  fontWeight="600"
                  fontSize="$3"
                  color="$color12"
                  numberOfLines={1}
                >
                  {claim.playerName ?? `Player #${claim.playerId}`}
                </Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  {claim.dropPlayerId && (
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
                      color="$blue11"
                      fontWeight="700"
                      backgroundColor="rgba(59, 130, 246, 0.12)"
                      paddingHorizontal="$1"
                      paddingVertical={1}
                      borderRadius="$1"
                    >
                      ${claim.faabBid} FAAB
                    </Text>
                  )}
                  <Text fontSize={10} color="$textMuted">
                    {claim.createdAt ? formatDate(claim.createdAt) : ''}
                  </Text>
                </XStack>
              </YStack>

              {/* Cancel button */}
              <Button
                size="$2"
                variant="outlined"
                theme="red"
                onPress={() => {
                  if (claim.id != null) void handleCancel(claim.id);
                }}
                disabled={cancellingId === claim.id || claim.id == null}
                aria-label={`Cancel waiver claim for ${claim.playerName ?? 'player'}`}
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
            {index < claims.length - 1 && (
              <Separator borderColor="$outlineSubtle" marginVertical={0} />
            )}
          </React.Fragment>
        ))}

        {/* Summary footer */}
        {claims.length > 0 && (
          <XStack
            paddingVertical="$2"
            paddingHorizontal="$3"
            borderTopWidth={1}
            borderTopColor="$outlineSubtle"
            justifyContent="center"
          >
            <Text fontSize="$1" color="$textMuted" textAlign="center">
              {claims.length} pending claim{claims.length !== 1 ? 's' : ''} —
              processed hourly
            </Text>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}
