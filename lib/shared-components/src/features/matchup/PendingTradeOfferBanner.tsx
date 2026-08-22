/**
 * PendingTradeOfferBanner -- persistent incoming trade-offer alert.
 *
 * Renders one banner per incoming pending trade offer with a "Review" action
 * (navigation is delegated to the consumer via `onReview`) and an inline
 * "Decline" action wired to `useRejectTradeMutation`. Cross-platform (tamagui):
 * consumed by the web league-detail page and shown above the tabs on the
 * native league screens (baseball + football).
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { X } from '@tamagui/lucide-icons/icons/X';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetTeamTradeOffersQuery,
  useRejectTradeMutation,
} from '@legacy-sports/graphql';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';
import { Button } from '../../Button';
import {
  getVerdict,
  tradeValue,
  VERDICT_CONFIG,
} from '../leagues/PremiumTradeTools';

export interface PendingTradeOfferBannerProps {
  /** The viewer's team id; incoming offers are those received by this team. */
  teamId: number;
  /**
   * Invoked when the user taps "Review". The consumer handles navigation
   * (web routes to the trades tab; native switches the active tab).
   */
  onReview: (tradeId: number) => void;
  /** Increment this value to trigger a refetch (e.g. on WebSocket events). */
  refetchTrigger?: number;
  /**
   * Whether the current user/league has the `premium` entitlement. When true,
   * each offer shows a fairness verdict computed from positional trade value
   * (LS-6350). Defaults to false so existing non-premium callers are unaffected.
   */
  isPremium?: boolean;
}

const playerNames = (
  players: ReadonlyArray<{ playerName?: string | null }> | null | undefined,
): string => {
  const names = (players ?? [])
    .map((p) => p.playerName)
    .filter((n): n is string => !!n);
  return names.length === 0 ? '—' : names.join(' · ');
};

export function PendingTradeOfferBanner({
  teamId,
  onReview,
  refetchTrigger,
  isPremium = false,
}: PendingTradeOfferBannerProps) {
  const { data, refetch } = useGetTeamTradeOffersQuery({
    variables: { teamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  const [rejectTrade, { loading: rejecting }] = useRejectTradeMutation();

  // Refetch when consumer triggers (e.g. WebSocket events)
  useEffect(() => {
    if (refetchTrigger && refetchTrigger > 0) {
      void refetch();
    }
  }, [refetchTrigger, refetch]);

  const incoming = useMemo(
    () =>
      (data?.teamTradeOffers ?? []).filter((t) => t.receivingTeamId === teamId),
    [data?.teamTradeOffers, teamId],
  );

  const handleDecline = useCallback(
    async (tradeId: number) => {
      try {
        await rejectTrade({ variables: { tradeId } });
        await refetch();
      } catch (err) {
        // Pass the Error instance as the first non-message arg so Rollbar /
        // LogArgs can extract the stack trace; never wrap it in `{ err }`.
        const errorArg = err instanceof Error ? err : new Error(String(err));
        LOGGER.error('Failed to decline trade offer', errorArg, { tradeId });
      }
    },
    [rejectTrade, refetch],
  );

  if (incoming.length === 0) return null;

  return (
    <YStack gap="$2">
      {incoming.map((trade) => {
        const tradeId = trade.id;
        if (tradeId == null) return null;
        const fromTeam = trade.proposingTeamName ?? 'Team';
        const offering = (trade.players ?? []).filter(
          (p) => p.fromTeamId === trade.proposingTeamId,
        );
        const requesting = (trade.players ?? []).filter(
          (p) => p.fromTeamId === trade.receivingTeamId,
        );
        const youGiveValue = tradeValue(requesting);
        const youGetValue = tradeValue(offering);
        const verdict = getVerdict(youGiveValue, youGetValue);
        const verdictConfig = VERDICT_CONFIG[verdict];
        return (
          <Card
            key={tradeId}
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
            borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
            borderWidth={1}
            borderRadius="$4"
            padding="$3"
          >
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <ArrowLeftRight size={18} color={BRAND_NAVY_LIGHT} />
              <YStack flex={1} minWidth={180} gap="$1">
                <Text fontSize="$3" fontWeight="700" color="$color">
                  Pending Trade Offer from {fromTeam}
                </Text>
                <Text fontSize="$2" color="$textMuted">
                  They offer: {playerNames(offering)} → You send:{' '}
                  {playerNames(requesting)}
                </Text>
                {isPremium && (
                  <XStack
                    alignItems="center"
                    gap="$1.5"
                    data-testid={`trade-fairness-${tradeId}`}
                  >
                    <Text
                      fontSize="$1"
                      color={verdictConfig.color}
                      fontWeight="700"
                    >
                      {verdictConfig.label}
                    </Text>
                    <Text fontSize="$1" color="$textMuted">
                      (you give {youGiveValue.toFixed(1)} · receive{' '}
                      {youGetValue.toFixed(1)})
                    </Text>
                  </XStack>
                )}
              </YStack>
              <XStack gap="$2" alignItems="center">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Check size={12} />}
                  onPress={() => onReview(tradeId)}
                >
                  Review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X size={12} />}
                  disabled={rejecting}
                  onPress={() => void handleDecline(tradeId)}
                >
                  Decline
                </Button>
              </XStack>
            </XStack>
          </Card>
        );
      })}
    </YStack>
  );
}
