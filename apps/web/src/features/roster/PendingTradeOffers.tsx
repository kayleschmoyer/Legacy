/**
 * PendingTradeOffers — compact trade-offer summary for the Roster tab.
 *
 * Shows incoming offers (user can Accept / Reject) and outgoing offers
 * (user can Cancel). Subscribes to the `trade-offer` WebSocket event so
 * the list refreshes in real time without a manual page reload.
 */
import React, { useCallback } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Card, Separator, Spinner, Text } from 'tamagui';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Clock,
  Send,
  X,
} from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  useAcceptTradeMutation,
  useCancelTradeMutation,
  useGetTeamTradeOffersQuery,
  useRejectTradeMutation,
} from '../../api/db/graphql.generated';
import { useLeagueWebSocket } from '../../hooks/useLeagueWebSocket';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GREEN,
  INJURY_OUT,
  PURPLE,
  WHITE,
  withAlpha,
} from '../../constants/colors';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingTradeOffersProps {
  teamId: number;
  leagueId: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PendingTradeOffers({
  teamId,
  leagueId: _leagueId,
}: PendingTradeOffersProps) {
  const [actionLoading, setActionLoading] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { data, loading, refetch } = useGetTeamTradeOffersQuery({
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  const [acceptTrade] = useAcceptTradeMutation();
  const [rejectTrade] = useRejectTradeMutation();
  const [cancelTrade] = useCancelTradeMutation();

  // ── WebSocket: auto-refresh on trade-offer or roster-update events ─────────
  useLeagueWebSocket({
    onTradeOffer: () => {
      void refetch();
    },
    onRosterUpdate: () => {
      void refetch();
    },
  });

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleAccept = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      setActionError(null);
      try {
        await acceptTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        LOGGER.error('Failed to accept trade:', String(err));
        setActionError('Failed to accept trade. Please try again.');
      } finally {
        setActionLoading(null);
      }
    },
    [acceptTrade, refetch],
  );

  const handleReject = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      setActionError(null);
      try {
        await rejectTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        LOGGER.error('Failed to reject trade:', String(err));
        setActionError('Failed to decline trade. Please try again.');
      } finally {
        setActionLoading(null);
      }
    },
    [rejectTrade, refetch],
  );

  const handleCancel = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      setActionError(null);
      try {
        await cancelTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        LOGGER.error('Failed to cancel trade:', String(err));
        setActionError('Failed to cancel trade. Please try again.');
      } finally {
        setActionLoading(null);
      }
    },
    [cancelTrade, refetch],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const offers = data?.teamTradeOffers ?? [];
  if (!data && loading) return null;
  if (offers.length === 0) return null;

  const incoming = offers.filter((o) => o.receivingTeamId === teamId);
  const outgoing = offers.filter((o) => o.proposingTeamId === teamId);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderOffer = (
    offer: (typeof offers)[number],
    variant: 'incoming' | 'outgoing',
  ) => {
    const isLoading = actionLoading === offer.id;
    const counterpartName =
      variant === 'incoming'
        ? (offer.proposingTeamName ?? 'Unknown Team')
        : (offer.receivingTeamName ?? 'Unknown Team');

    const offeringPlayers = (offer.players ?? []).filter(
      (p) =>
        p.fromTeamId != null &&
        p.fromTeamId ===
          (variant === 'incoming' ? offer.proposingTeamId : teamId),
    );
    const requestingPlayers = (offer.players ?? []).filter(
      (p) =>
        p.fromTeamId != null &&
        p.fromTeamId ===
          (variant === 'incoming' ? teamId : offer.receivingTeamId),
    );

    return (
      <Card
        key={offer.id}
        backgroundColor={withAlpha(WHITE, 0.04)}
        borderWidth={1}
        borderColor={
          variant === 'incoming'
            ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
            : withAlpha(PURPLE, 0.25)
        }
        borderRadius="$4"
        padding="$3"
        gap="$2"
      >
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            {variant === 'incoming' ? (
              <ArrowLeftRight size={14} color={BRAND_NAVY_LIGHT} />
            ) : (
              <Send size={14} color="var(--purple10)" />
            )}
            <Text fontSize="$2" fontWeight="700" color="$color">
              {variant === 'incoming' ? 'From' : 'To'}: {counterpartName}
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$1">
            <Clock size={12} color="var(--textMuted)" />
            <Text fontSize="$1" color="$textMuted">
              {formatDate(offer.createdAt)}
            </Text>
          </XStack>
        </XStack>

        <XStack gap="$3" flexWrap="wrap">
          {offeringPlayers.length > 0 && (
            <YStack gap="$1" flex={1} minWidth={100}>
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                {variant === 'incoming' ? 'They offer' : 'You offer'}
              </Text>
              {offeringPlayers.map((p) => (
                <Text key={p.id} fontSize="$2" color="$color">
                  {p.playerName}
                </Text>
              ))}
            </YStack>
          )}
          {requestingPlayers.length > 0 && (
            <YStack gap="$1" flex={1} minWidth={100}>
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                {variant === 'incoming' ? 'They want' : 'You want'}
              </Text>
              {requestingPlayers.map((p) => (
                <Text key={p.id} fontSize="$2" color="$color">
                  {p.playerName}
                </Text>
              ))}
            </YStack>
          )}
        </XStack>

        {offer.message && (
          <Text fontSize="$1" color="$textMuted" fontStyle="italic">
            &ldquo;{offer.message}&rdquo;
          </Text>
        )}

        <XStack gap="$2" marginTop="$1">
          {variant === 'incoming' && (
            <>
              <Button
                size="$2"
                flex={1}
                backgroundColor={withAlpha(GREEN, 0.15)}
                borderColor="$green7"
                borderWidth={1}
                borderRadius="$3"
                onPress={() => offer.id != null && void handleAccept(offer.id)}
                disabled={isLoading}
                icon={
                  isLoading ? (
                    <Spinner size="small" />
                  ) : (
                    <Check size={12} color="var(--green10)" />
                  )
                }
              >
                <Text fontSize="$2" color="$green10" fontWeight="600">
                  Accept
                </Text>
              </Button>
              <Button
                size="$2"
                flex={1}
                backgroundColor={withAlpha(INJURY_OUT, 0.12)}
                borderColor="$red7"
                borderWidth={1}
                borderRadius="$3"
                onPress={() => offer.id != null && void handleReject(offer.id)}
                disabled={isLoading}
                icon={
                  isLoading ? (
                    <Spinner size="small" />
                  ) : (
                    <X size={12} color="var(--red10)" />
                  )
                }
              >
                <Text fontSize="$2" color="$red10" fontWeight="600">
                  Decline
                </Text>
              </Button>
            </>
          )}
          {variant === 'outgoing' && (
            <Button
              size="$2"
              backgroundColor={withAlpha(INJURY_OUT, 0.12)}
              borderColor="$red7"
              borderWidth={1}
              borderRadius="$3"
              onPress={() => offer.id != null && void handleCancel(offer.id)}
              disabled={isLoading}
              icon={
                isLoading ? (
                  <Spinner size="small" />
                ) : (
                  <X size={12} color="var(--red10)" />
                )
              }
            >
              <Text fontSize="$2" color="$red10" fontWeight="600">
                Cancel
              </Text>
            </Button>
          )}
        </XStack>
      </Card>
    );
  };

  return (
    <YStack
      backgroundColor={withAlpha(WHITE, 0.02)}
      borderWidth={1}
      borderColor={withAlpha(WHITE, 0.08)}
      borderRadius="$5"
      padding="$4"
      gap="$3"
    >
      <XStack alignItems="center" gap="$2">
        <ArrowLeftRight size={16} color={BRAND_NAVY_LIGHT} />
        <Text fontSize="$4" fontWeight="700" color="$color">
          Pending Trades
        </Text>
        <Text
          fontSize="$2"
          color="$textMuted"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$2"
        >
          {offers.length}
        </Text>
      </XStack>

      {actionError && (
        <XStack
          backgroundColor="$red3"
          borderRadius="$2"
          padding="$2"
          alignItems="center"
          gap="$2"
        >
          <AlertTriangle size={14} color="$red10" />
          <Text fontSize="$2" color="$red10">
            {actionError}
          </Text>
        </XStack>
      )}

      {incoming.length > 0 && (
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            Incoming ({incoming.length})
          </Text>
          {incoming.map((o) => renderOffer(o, 'incoming'))}
        </YStack>
      )}

      {incoming.length > 0 && outgoing.length > 0 && <Separator />}

      {outgoing.length > 0 && (
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="700" color="$purple10">
            Outgoing ({outgoing.length})
          </Text>
          {outgoing.map((o) => renderOffer(o, 'outgoing'))}
        </YStack>
      )}
    </YStack>
  );
}
