/**
 * PendingTradeOffers — compact trade-offer summary for the Roster tab.
 *
 * Shows incoming offers (user can Accept / Reject) and outgoing offers
 * (user can Cancel). Subscribes to the `trade-offer` WebSocket event so
 * the list refreshes in real time without a manual page reload.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Button, XStack, YStack } from '@legacy-sports/shared-components';
import { Card, Separator, Spinner, Text } from 'tamagui';
import { ArrowLeftRight, Check, Clock, Send, X } from '@tamagui/lucide-icons';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import type { NotificationData } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils/notification-types';
import {
  useAcceptTradeMutation,
  useCancelTradeMutation,
  useGetTeamTradeOffersQuery,
  useRejectTradeMutation,
} from '../../api/db/graphql.generated';
import { env } from '../../config/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingTradeOffersProps {
  teamId: number;
  leagueId: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PendingTradeOffers({
  teamId,
  leagueId,
}: PendingTradeOffersProps) {
  const [actionLoading, setActionLoading] = React.useState<number | null>(null);

  const { data, loading, refetch } = useGetTeamTradeOffersQuery({
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  const [acceptTrade] = useAcceptTradeMutation();
  const [rejectTrade] = useRejectTradeMutation();
  const [cancelTrade] = useCancelTradeMutation();

  // Keep stable ref for WS effect
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // ── WebSocket: auto-refresh on trade-offer or roster-update events ─────────
  useEffect(() => {
    let active = true;
    const wsUrl = env.websocketUrl;
    if (!wsUrl) return;
    const token =
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem('auth_jwt') ?? '')
        : '';
    if (!token) return;

    const client = new WebSocketClient({
      url: wsUrl,
      token,
      leagueId,
      viewContext: 'roster',
      autoConnect: false,
    });

    const handleRefresh = (_notification: NotificationData) => {
      if (active) {
        void refetchRef.current();
      }
    };

    client.on(ClientNotificationType.TRADE_OFFER, handleRefresh);
    client.on(ClientNotificationType.ROSTER_UPDATE, handleRefresh);
    client.connect();

    return () => {
      active = false;
      client.dispose();
    };
  }, [leagueId]);

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleAccept = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      try {
        await acceptTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        console.error('Failed to accept trade:', err);
      } finally {
        setActionLoading(null);
      }
    },
    [acceptTrade, refetch],
  );

  const handleReject = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      try {
        await rejectTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        console.error('Failed to reject trade:', err);
      } finally {
        setActionLoading(null);
      }
    },
    [rejectTrade, refetch],
  );

  const handleCancel = useCallback(
    async (tradeId: number) => {
      setActionLoading(tradeId);
      try {
        await cancelTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        console.error('Failed to cancel trade:', err);
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
        backgroundColor="rgba(255,255,255,0.04)"
        borderWidth={1}
        borderColor={
          variant === 'incoming'
            ? 'rgba(59,130,246,0.35)'
            : 'rgba(168,85,247,0.25)'
        }
        borderRadius="$4"
        padding="$3"
        gap="$2"
      >
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            {variant === 'incoming' ? (
              <ArrowLeftRight size={14} color="var(--blue10)" />
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
                backgroundColor="rgba(34,197,94,0.15)"
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
                backgroundColor="rgba(239,68,68,0.12)"
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
              backgroundColor="rgba(239,68,68,0.12)"
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
      backgroundColor="rgba(255,255,255,0.02)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.08)"
      borderRadius="$5"
      padding="$4"
      gap="$3"
    >
      <XStack alignItems="center" gap="$2">
        <ArrowLeftRight size={16} color="var(--blue10)" />
        <Text fontSize="$4" fontWeight="700" color="$color">
          Pending Trades
        </Text>
        <Text
          fontSize="$2"
          color="$textMuted"
          backgroundColor="rgba(59,130,246,0.15)"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$2"
        >
          {offers.length}
        </Text>
      </XStack>

      {incoming.length > 0 && (
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="700" color="$blue10">
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
