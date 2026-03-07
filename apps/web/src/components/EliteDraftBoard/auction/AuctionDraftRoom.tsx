/**
 * AuctionDraftRoom — LS-646
 *
 * Renders the auction draft room UI:
 *   - Current nominated player + countdown bid timer
 *   - Nomination controls (when it's the user's turn to nominate)
 *   - Bid placement input + button
 *   - Per-team budget tracker table
 *
 * Polls every 5 seconds for updated state (no WebSocket hook needed here).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  H5,
  Input,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Gavel, Timer, Trophy } from '@tamagui/lucide-icons';
import {
  AuctionBudgetFragmentFragment,
  AuctionStateFragmentFragment,
  useGetAuctionBudgetsQuery,
  useGetAuctionStateQuery,
  useNominatePlayerMutation,
  usePlaceBidMutation,
} from '../../../api/db/graphql.generated';
import {
  AMBER,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GREEN,
  RED,
  withAlpha,
} from '../../../constants/colors';

// ---------------------------------------------------------------------------
// Countdown timer hook — counts down to a deadline ISO string
// ---------------------------------------------------------------------------
function useCountdown(deadlineIso: string | null | undefined): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!deadlineIso) {
      setSeconds(0);
      return;
    }

    const update = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(deadlineIso).getTime() - Date.now()) / 1000),
      );
      setSeconds(diff);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return seconds;
}

// ---------------------------------------------------------------------------
// BidTimer — colour-coded countdown ring using SVG
// ---------------------------------------------------------------------------
const TIMER_R = 46;
const TIMER_C = 2 * Math.PI * TIMER_R;

function BidTimer({
  seconds,
  totalSeconds,
}: {
  seconds: number;
  totalSeconds: number;
}) {
  const progress = totalSeconds > 0 ? seconds / totalSeconds : 1;
  const offset = TIMER_C * (1 - Math.min(1, Math.max(0, progress)));

  const color = seconds <= 5 ? RED : seconds <= 15 ? AMBER : GREEN;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const label = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      position="relative"
      width={120}
      height={120}
    >
      <svg
        viewBox="0 0 120 120"
        width={120}
        height={120}
        aria-label={`${label} remaining`}
        role="timer"
      >
        <circle
          cx="60"
          cy="60"
          r={TIMER_R}
          fill="none"
          stroke={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
          strokeWidth={8}
        />
        <circle
          cx="60"
          cy="60"
          r={TIMER_R}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={TIMER_C}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="55"
          textAnchor="middle"
          fontSize="18"
          fontWeight="bold"
          fill={color}
        >
          {label}
        </text>
        <text
          x="60"
          y="73"
          textAnchor="middle"
          fontSize="10"
          fill={withAlpha(BRAND_NAVY_LIGHT, 0.7)}
        >
          BID TIMER
        </text>
      </svg>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// NominationPanel — shown when it should be the current user's pick turn
// ---------------------------------------------------------------------------
function NominationPanel({
  draftId,
  onNominated,
}: {
  draftId: number;
  onNominated: () => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [nominate, { loading }] = useNominatePlayerMutation();

  const handleNominate = useCallback(async () => {
    const pid = parseInt(playerId, 10);
    if (isNaN(pid)) return;
    await nominate({ variables: { draftId, playerId: pid } });
    setPlayerId('');
    onNominated();
  }, [draftId, nominate, onNominated, playerId]);

  return (
    <Card
      padding="$4"
      borderRadius="$5"
      borderWidth={2}
      borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.5)}
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
    >
      <YStack gap="$3">
        <XStack alignItems="center" gap="$2">
          <Gavel size={18} color={BRAND_GOLD_LIGHT} />
          <Text fontWeight="700" fontSize="$4" color={BRAND_GOLD_LIGHT}>
            Your Turn to Nominate
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          Enter a player ID to put them up for auction. The highest bidder wins.
        </Text>
        <XStack gap="$3" alignItems="center">
          <Input
            flex={1}
            value={playerId}
            onChangeText={setPlayerId}
            placeholder="Player ID"
            keyboardType="numeric"
            aria-label="Player ID to nominate"
          />
          <Button
            theme="yellow"
            onPress={() => void handleNominate()}
            disabled={loading || !playerId}
            aria-label="Nominate player"
          >
            {loading ? 'Nominating…' : 'Nominate'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// BidPanel — shown when a player is currently up for bidding
// ---------------------------------------------------------------------------
function BidPanel({
  draftId,
  currentBid,
  onBidPlaced,
}: {
  draftId: number;
  currentBid: number;
  onBidPlaced: () => void;
}) {
  const [amount, setAmount] = useState(String(currentBid + 1));
  const [placeBid, { loading }] = usePlaceBidMutation();

  const minBid = currentBid + 1;

  const handleBid = useCallback(async () => {
    const bid = parseInt(amount, 10);
    if (isNaN(bid) || bid < minBid) return;
    await placeBid({ variables: { draftId, amount: bid } });
    onBidPlaced();
  }, [amount, draftId, minBid, onBidPlaced, placeBid]);

  return (
    <YStack gap="$2">
      <Text fontSize="$3" fontWeight="600" color="$color12">
        Place Your Bid
      </Text>
      <XStack gap="$3" alignItems="center">
        <Input
          flex={1}
          value={amount}
          onChangeText={setAmount}
          placeholder={`Min: $${minBid}`}
          keyboardType="numeric"
          aria-label="Bid amount"
        />
        <Button
          theme="green"
          onPress={() => void handleBid()}
          disabled={loading || parseInt(amount, 10) < minBid}
          aria-label="Submit bid"
        >
          {loading ? 'Bidding…' : `Bid $${amount}`}
        </Button>
      </XStack>
      <Text fontSize="$2" color="$textMuted">
        Minimum bid: ${minBid}
      </Text>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// BudgetTable — per-team remaining budget and players won
// ---------------------------------------------------------------------------
function BudgetTable({
  budgets,
  myTeamId,
}: {
  budgets: AuctionBudgetFragmentFragment[];
  myTeamId?: number;
}) {
  return (
    <Card
      padding="$4"
      borderRadius="$5"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
    >
      <YStack gap="$3">
        <XStack alignItems="center" gap="$2">
          <Trophy size={16} color={BRAND_GOLD_LIGHT} />
          <H5 margin={0}>Budget Tracker</H5>
        </XStack>
        <Separator borderColor="$outlineSubtle" />
        {/* Header row */}
        <XStack paddingHorizontal="$2" gap="$2">
          <Text
            flex={2}
            fontSize="$2"
            fontWeight="700"
            color="$textMuted"
            textTransform="uppercase"
          >
            Team
          </Text>
          <Text
            flex={1}
            fontSize="$2"
            fontWeight="700"
            color="$textMuted"
            textAlign="right"
            textTransform="uppercase"
          >
            Budget
          </Text>
          <Text
            flex={1}
            fontSize="$2"
            fontWeight="700"
            color="$textMuted"
            textAlign="right"
            textTransform="uppercase"
          >
            Max Bid
          </Text>
          <Text
            flex={1}
            fontSize="$2"
            fontWeight="700"
            color="$textMuted"
            textAlign="right"
            textTransform="uppercase"
          >
            Won
          </Text>
        </XStack>
        <Separator borderColor="$outlineSubtle" />
        {budgets.map((b) => {
          const isMe = b.team?.id === myTeamId;
          const lowBudget = (b.remainingBudget ?? 0) <= (b.maxBid ?? 0) * 0.3;
          return (
            <XStack
              key={b.team?.id}
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$3"
              backgroundColor={
                isMe ? withAlpha(BRAND_NAVY_LIGHT, 0.1) : 'transparent'
              }
              gap="$2"
            >
              <Text
                flex={2}
                fontSize="$3"
                fontWeight={isMe ? '700' : '500'}
                color={isMe ? BRAND_GOLD_LIGHT : '$color12'}
                numberOfLines={1}
              >
                {b.team?.name ?? '—'}
              </Text>
              <Text
                flex={1}
                fontSize="$3"
                fontWeight="600"
                color={lowBudget ? RED : GREEN}
                textAlign="right"
              >
                ${(b.remainingBudget ?? 0).toLocaleString()}
              </Text>
              <Text flex={1} fontSize="$3" color="$textMuted" textAlign="right">
                ${(b.maxBid ?? 0).toLocaleString()}
              </Text>
              <Text flex={1} fontSize="$3" color="$textMuted" textAlign="right">
                {b.playersWon ?? 0}
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ActiveNomination — shows the player on the block with bid info
// ---------------------------------------------------------------------------
function ActiveNomination({
  state,
  myTeamId,
  draftId,
  onBidPlaced,
}: {
  state: AuctionStateFragmentFragment;
  myTeamId?: number;
  draftId: number;
  onBidPlaced: () => void;
}) {
  const bidSeconds = useCountdown(state.bidDeadline);
  const isMyBid = state.currentBidder?.id === myTeamId;
  const player = state.nominatedPlayer;
  const playerName = player
    ? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim()
    : 'Unknown Player';

  return (
    <Card
      padding="$5"
      borderRadius="$6"
      borderWidth={2}
      borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.4)}
      backgroundColor="$surfacePanel"
    >
      <YStack gap="$4">
        <XStack
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap="$4"
        >
          <YStack gap="$1" flex={1}>
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$textMuted"
              textTransform="uppercase"
              letterSpacing={1}
            >
              On the Block
            </Text>
            <Text
              fontSize="$7"
              fontWeight="800"
              color={BRAND_GOLD_LIGHT}
              numberOfLines={1}
            >
              {playerName}
            </Text>
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <YStack>
                <Text fontSize="$2" color="$textMuted">
                  Current Bid
                </Text>
                <Text fontSize="$5" fontWeight="700" color="$green9">
                  ${(state.currentBid ?? 0).toLocaleString()}
                </Text>
              </YStack>
              {state.currentBidder && (
                <YStack>
                  <Text fontSize="$2" color="$textMuted">
                    Leading Bidder
                  </Text>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color={isMyBid ? BRAND_GOLD_LIGHT : '$color12'}
                  >
                    {isMyBid ? 'You!' : (state.currentBidder.name ?? '—')}
                  </Text>
                </YStack>
              )}
            </XStack>
          </YStack>
          <BidTimer seconds={bidSeconds} totalSeconds={30} />
        </XStack>

        {myTeamId !== state.currentBidder?.id && (
          <BidPanel
            draftId={draftId}
            currentBid={state.currentBid ?? 0}
            onBidPlaced={onBidPlaced}
          />
        )}
        {isMyBid && (
          <Card
            padding="$3"
            borderRadius="$4"
            backgroundColor={withAlpha(GREEN, 0.1)}
            borderColor={withAlpha(GREEN, 0.3)}
            borderWidth={1}
          >
            <Text fontSize="$3" color="$green9" fontWeight="600">
              You are the current high bidder. Wait for the timer or get outbid.
            </Text>
          </Card>
        )}
      </YStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// NominationTimer — waiting for nominator to pick
// ---------------------------------------------------------------------------
function NominationWaiting({
  state,
  myTeamId,
  draftId,
  onNominated,
}: {
  state: AuctionStateFragmentFragment;
  myTeamId?: number;
  draftId: number;
  onNominated: () => void;
}) {
  const nomSeconds = useCountdown(state.nominationDeadline);
  const isMyTurn = state.nominatorTeam?.id === myTeamId;

  return (
    <Card
      padding="$5"
      borderRadius="$6"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
    >
      <YStack gap="$4">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$3"
        >
          <YStack gap="$1">
            <XStack alignItems="center" gap="$2">
              <Timer size={20} color={BRAND_NAVY_LIGHT} />
              <Text fontSize="$5" fontWeight="700" color="$color12">
                {isMyTurn ? 'Your Turn to Nominate!' : 'Waiting for Nomination'}
              </Text>
            </XStack>
            <Text fontSize="$3" color="$textMuted">
              {isMyTurn
                ? 'Choose a player to put up for auction.'
                : `${state.nominatorTeam?.name ?? 'A team'} is choosing a player.`}
            </Text>
          </YStack>
          <BidTimer seconds={nomSeconds} totalSeconds={60} />
        </XStack>

        {isMyTurn && state.nominatorTeam?.id != null && (
          <NominationPanel draftId={draftId} onNominated={onNominated} />
        )}

        {state.nominationOrder != null && (
          <XStack gap="$2" alignItems="center">
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$textMuted"
              textTransform="uppercase"
            >
              Pick #{state.nominationOrder}
            </Text>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AuctionDraftRoom — main exported component
// ---------------------------------------------------------------------------

export interface AuctionDraftRoomProps {
  draftId: number;
  /** The current user's team ID — used to highlight "your turn" actions */
  myTeamId?: number;
}

export function AuctionDraftRoom({
  draftId,
  myTeamId,
}: AuctionDraftRoomProps): React.JSX.Element {
  const pollInterval = 5000; // 5 s polling

  const {
    data: stateData,
    loading: stateLoading,
    refetch: refetchState,
  } = useGetAuctionStateQuery({
    variables: { draftId },
    pollInterval,
    fetchPolicy: 'network-only',
  });

  const {
    data: budgetsData,
    loading: budgetsLoading,
    refetch: refetchBudgets,
  } = useGetAuctionBudgetsQuery({
    variables: { draftId },
    pollInterval,
    fetchPolicy: 'network-only',
  });

  const refetchAll = useCallback(() => {
    void refetchState();
    void refetchBudgets();
  }, [refetchState, refetchBudgets]);

  const auctionState = stateData?.auctionState;
  const budgets = useMemo(
    () =>
      (budgetsData?.auctionBudgets ?? []) as AuctionBudgetFragmentFragment[],
    [budgetsData],
  );

  const isLoading = stateLoading || budgetsLoading;

  if (isLoading && !auctionState) {
    return (
      <YStack padding="$6" alignItems="center" role="status">
        <Text fontSize="$4" color="$textMuted">
          Loading auction room…
        </Text>
      </YStack>
    );
  }

  if (!auctionState) {
    return (
      <YStack padding="$6" alignItems="center" gap="$2" role="status">
        <Text fontSize="$5" fontWeight="700" color="$textMuted">
          Auction Not Started
        </Text>
        <Text fontSize="$3" color="$textMuted">
          The auction draft has not begun yet. Check back soon.
        </Text>
      </YStack>
    );
  }

  const hasActiveNomination = auctionState.nominatedPlayer != null;

  return (
    <YStack width="100%" role="region" aria-label="Auction draft room">
      <YStack padding="$5" gap="$5" alignItems="center">
        <YStack width="100%" maxWidth={1280} gap="$5">
          {/* Header */}
          <XStack
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap="$3"
          >
            <XStack alignItems="center" gap="$2">
              <Gavel size={24} color={BRAND_GOLD_LIGHT} />
              <H4 margin={0}>Auction Draft Room</H4>
            </XStack>
            <Text fontSize="$2" color="$textMuted">
              Draft #{draftId} · polling every 5s
            </Text>
          </XStack>

          {/* Main content — split: active bid / nomination on left, budgets on right */}
          <XStack gap="$5" flexWrap="wrap" alignItems="flex-start">
            <YStack flex={2} minWidth={320} gap="$4">
              {hasActiveNomination ? (
                <ActiveNomination
                  state={auctionState as AuctionStateFragmentFragment}
                  myTeamId={myTeamId}
                  draftId={draftId}
                  onBidPlaced={refetchAll}
                />
              ) : (
                <NominationWaiting
                  state={auctionState as AuctionStateFragmentFragment}
                  myTeamId={myTeamId}
                  draftId={draftId}
                  onNominated={refetchAll}
                />
              )}
            </YStack>

            <YStack flex={1} minWidth={280} maxWidth={380}>
              <BudgetTable budgets={budgets} myTeamId={myTeamId} />
            </YStack>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
