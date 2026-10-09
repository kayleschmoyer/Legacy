/**
 * TradingCenter — Full trade management UI for a fantasy league
 *
 * Features:
 *  - View incoming trade offers with Accept / Reject actions
 *  - View outgoing (pending) offers with Cancel action
 *  - View completed trade history (accepted / rejected / vetoed)
 *  - Multi-step "Propose Trade" form:
 *      1. Pick counterpart team
 *      2. Choose players to offer from your roster
 *      3. Choose players to request from their roster
 *      4. Optional message + confirm
 *  - Commissioner veto button on accepted trades
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, useWindowDimensions } from 'react-native';
import {
  Card,
  type CardProps,
  Input,
  ScrollView,
  Separator,
  Spinner,
  Text,
  Tooltip,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { ChevronRight } from '@tamagui/lucide-icons/icons/ChevronRight';
import { ChevronUp } from '@tamagui/lucide-icons/icons/ChevronUp';
import { Clock } from '@tamagui/lucide-icons/icons/Clock';
import { DollarSign } from '@tamagui/lucide-icons/icons/DollarSign';
import { Filter } from '@tamagui/lucide-icons/icons/Filter';
import { History } from '@tamagui/lucide-icons/icons/History';
import { MessageSquare } from '@tamagui/lucide-icons/icons/MessageSquare';
import { Send } from '@tamagui/lucide-icons/icons/Send';
import { Shield } from '@tamagui/lucide-icons/icons/Shield';
import { ThumbsDown } from '@tamagui/lucide-icons/icons/ThumbsDown';
import { ThumbsUp } from '@tamagui/lucide-icons/icons/ThumbsUp';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { X } from '@tamagui/lucide-icons/icons/X';
import { Zap } from '@tamagui/lucide-icons/icons/Zap';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetLeagueTradeOffers,
  type GetLeagueTradeOffersQuery,
  type GetLeagueTradeOffersQueryVariables,
  GetTeamTradeOffers,
  type GetTeamTradeOffersQuery,
  type GetTeamTradeOffersQueryVariables,
  TradeOfferFragment,
  TradeVoteChoice,
  useAcceptTradeMutation,
  useCancelTradeMutation,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsQuery,
  useGetLeagueTradeOffersQuery,
  useGetTeamByIdQuery,
  useGetTeamMembersLazyQuery,
  useGetTeamTradeOffersQuery,
  useProposeTradeMutation,
  useRejectTradeMutation,
  useVetoTradeMutation,
  useVoteOnTradeMutation,
} from '@legacy-sports/graphql';
import { PremiumTradeTools } from './PremiumTradeTools';
import {
  computeTradeCapPreview,
  formatSalary,
  formatSalaryDelta,
} from './tradeCapPreview';
import { Button } from '../../Button';
import { Dropdown } from '../../Dropdown';
import { LeagueTradeBlock } from '../matchup/LeagueTradeBlock';
import { RosterOverLimitNotice } from '../roster/RosterOverLimitBanner';
import {
  BLACK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  SURFACE_PANEL,
  withAlpha,
} from '../../utils/colors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function GlassCard(props: CardProps) {
  return (
    <Card borderWidth={1} borderRadius="$6" overflow="hidden" {...props} />
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TradingCenterProps {
  leagueId: number;
  userTeamId: number;
  isCommissioner?: boolean;
  /** Whether the current user/league has the `premium` entitlement. This prop
   * controls general premium features, including league trade voting. For the
   * Premium Trade Tools panel, use `canUseTradeTools` instead. */
  isPremium?: boolean;
  /** Whether the viewer holds the `trade_analyzer` entitlement. Unlocks the
   * Premium Trade Tools panel only (not league trade voting). Falls back to
   * `isPremium` when omitted. */
  canUseTradeTools?: boolean;
  /** Called when a non-premium user clicks "Upgrade to Premium" in the
   * Premium Analysis Tools gate overlay. */
  onUpgradePremium?: () => void;
  /**
   * Optional callback invoked when real-time events (trade offers, roster
   * updates) should trigger a data refresh.  On web this is wired to
   * `useLeagueWebSocket`; on mobile the caller can provide its own push
   * notification or polling mechanism.  When omitted the component still
   * works — users just need to manually refresh.
   */
  onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
  /**
   * When set (e.g. from a notification deep link `?offerId=`), the component
   * fetches the specific offer and surfaces a "no longer available" or
   * "not found" banner when the offer is expired, vetoed, cancelled, or absent.
   * The matching offer card is also highlighted with a gold border.
   */
  deepLinkOfferId?: number;
}

type ProposeStep = 'team' | 'offer' | 'request' | 'confirm';

interface ProposalDraft {
  receivingTeamId: number | null;
  offeringPlayerIds: number[];
  requestingPlayerIds: number[];
  message: string;
  expiresInDays: number | null;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function statusBadge(status: string): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  switch (status) {
    case 'pending':
      return {
        bg: '$amber3',
        border: '$amber7',
        text: '$amber11',
        label: 'Pending',
      };
    case 'accepted':
      return {
        bg: '$green3',
        border: '$green7',
        text: '$green11',
        label: 'Accepted',
      };
    case 'rejected':
      return {
        bg: '$red3',
        border: '$red7',
        text: '$red11',
        label: 'Rejected',
      };
    case 'cancelled':
      return {
        bg: '$gray3',
        border: '$gray7',
        text: '$gray11',
        label: 'Cancelled',
      };
    case 'vetoed':
      return {
        bg: '$statusAccentBg',
        border: '$statusAccentBorder',
        text: '$statusAccentFg',
        label: 'Vetoed',
      };
    case 'expired':
      return {
        bg: '$gray3',
        border: '$gray7',
        text: '$gray11',
        label: 'Expired',
      };
    default:
      return {
        bg: '$gray3',
        border: '$gray7',
        text: '$gray11',
        label: status,
      };
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Expiry options ────────────────────────────────────────────────────────────

const EXPIRY_OPTIONS = [
  { value: null, label: 'No expiry' },
  { value: 1, label: '1 day' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
] as const;

// ── TradeOfferCard ─────────────────────────────────────────────────────────────

interface TradeOfferCardProps {
  trade: TradeOfferFragment;
  userTeamId: number;
  isCommissioner?: boolean;
  highlighted?: boolean;
  onAccept?: (id: number) => void;
  onReject?: (id: number) => void;
  onCancel?: (id: number) => void;
  onVeto?: (id: number) => void;
  /** League-member vote on an accepted trade during commissioner review (LS-6349, premium leagues). */
  onVote?: (id: number, vote: TradeVoteChoice) => void;
  actionLoading?: number | null;
  /** Whether the league enforces a salary cap (premium). Enables the cap preview. */
  salaryCapEnabled?: boolean;
  /** The league's salary cap ceiling in dollars. */
  salaryCap?: number | null;
  /** The viewing team's current total payroll in dollars, for the over-cap warning. */
  viewerCurrentPayroll?: number | null;
  /** Whether the viewer/league has the `premium` entitlement — gates the league-vote panel. */
  isPremium?: boolean;
}

function TradeOfferCard({
  trade,
  userTeamId,
  isCommissioner,
  highlighted = false,
  onAccept,
  onReject,
  onCancel,
  onVeto,
  onVote,
  actionLoading,
  salaryCapEnabled = false,
  salaryCap,
  viewerCurrentPayroll,
  isPremium = false,
}: TradeOfferCardProps) {
  const badge = statusBadge(trade.status ?? 'pending');
  const isIncoming =
    trade.receivingTeamId === userTeamId &&
    trade.proposingTeamId !== userTeamId;
  const isOutgoing = trade.proposingTeamId === userTeamId;

  // Split player legs by direction
  const offeringPlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId === trade.proposingTeamId,
  );
  const requestingPlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId === trade.receivingTeamId,
  );

  // Salary-cap preview (LS-5971): in a cap-enabled league, show the salary the
  // viewing team takes on / sheds and warn when accepting would exceed the cap.
  const capPreview = salaryCapEnabled
    ? computeTradeCapPreview({
        players: trade.players ?? [],
        viewerTeamId: userTeamId,
        salaryCap,
        currentPayroll: viewerCurrentPayroll,
      })
    : null;

  const isLoading = actionLoading === trade.id;

  // League-member vote tally (LS-6349) — premium leagues let non-participating
  // teams weigh in on an accepted trade alongside the commissioner's veto.
  const votes = trade.votes ?? [];
  const voteApproveCount = votes.filter((v) => v.vote === 'approve').length;
  const voteVetoCount = votes.filter((v) => v.vote === 'veto').length;
  const viewerVote = votes.find((v) => v.teamId === userTeamId)?.vote ?? null;
  const isVoteEligible =
    isPremium &&
    trade.status === 'accepted' &&
    userTeamId !== trade.proposingTeamId &&
    userTeamId !== trade.receivingTeamId;

  // For incoming pending trades, cross-reference the offering team's current roster
  // to detect players who were dropped after the trade was proposed.
  const [
    loadProposerRoster,
    { data: proposerRosterData, error: rosterFetchError },
  ] = useGetTeamMembersLazyQuery();

  useEffect(() => {
    if (
      isIncoming &&
      trade.status === 'pending' &&
      trade.proposingTeamId != null
    ) {
      void loadProposerRoster({ variables: { teamId: trade.proposingTeamId } });
    }
  }, [isIncoming, trade.status, trade.proposingTeamId, loadProposerRoster]);

  const proposerCurrentPlayerIds = useMemo<Set<number> | null>(() => {
    if (!proposerRosterData?.teamMembers) return null;
    const ids = new Set<number>();
    for (const m of proposerRosterData.teamMembers) {
      if (m.playerId != null) ids.add(m.playerId);
    }
    return ids;
  }, [proposerRosterData]);

  const hasStaleOfferingPlayers = useMemo(
    () =>
      proposerCurrentPlayerIds != null &&
      offeringPlayers.some(
        (p) => p.playerId != null && !proposerCurrentPlayerIds.has(p.playerId),
      ),
    [offeringPlayers, proposerCurrentPlayerIds],
  );

  // If the roster fetch errored we can't verify player eligibility — disable Accept as a safe default.
  const hasRosterFetchError =
    isIncoming && trade.status === 'pending' && rosterFetchError != null;

  const statusBarColor =
    trade.status === 'pending'
      ? '$amber9'
      : trade.status === 'accepted'
        ? '$green9'
        : trade.status === 'vetoed'
          ? '$statusAccentFg'
          : '$gray9';

  return (
    <GlassCard
      backgroundColor={withAlpha(SURFACE_PANEL, 0.65)}
      borderColor={highlighted ? BRAND_GOLD_LIGHT : badge.border}
      borderWidth={highlighted ? 2 : 1}
    >
      {/* Status accent bar */}
      <YStack height={2} width="100%" backgroundColor={statusBarColor} />

      {/* Header row */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor="$outlineSubtle"
      >
        <XStack alignItems="center" gap="$2">
          <ArrowLeftRight size={14} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$2" fontWeight="700" color="$color">
            {isOutgoing
              ? `To: ${trade.receivingTeamName ?? 'Unknown Team'}`
              : `From: ${trade.proposingTeamName ?? 'Unknown Team'}`}
          </Text>
        </XStack>

        {/* Status badge */}
        <XStack
          backgroundColor={badge.bg}
          borderColor={badge.border}
          borderWidth={1}
          borderRadius="$10"
          paddingHorizontal="$2"
          paddingVertical="$0.5"
        >
          <Text fontSize="$1" fontWeight="700" color={badge.text}>
            {badge.label.toUpperCase()}
          </Text>
        </XStack>
      </XStack>

      {/* Player legs */}
      <XStack paddingHorizontal="$3" paddingVertical="$3" gap="$3">
        {/* Proposing team gives */}
        <YStack flex={1} gap="$1">
          <Text
            fontSize="$1"
            color="$textMuted"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            {isOutgoing
              ? 'You Give'
              : `${trade.proposingTeamName ?? 'They'} Give`}
          </Text>
          {offeringPlayers.length === 0 ? (
            <Text fontSize="$2" color="$textSubtle" fontStyle="italic">
              —
            </Text>
          ) : (
            offeringPlayers.map((p, index) => {
              const isStale =
                proposerCurrentPlayerIds != null &&
                p.playerId != null &&
                !proposerCurrentPlayerIds.has(p.playerId);
              return (
                <XStack
                  key={p.id ?? `${p.playerId}-${p.fromTeamId}-${index}`}
                  alignItems="center"
                  gap="$1.5"
                >
                  {p.playerPosition && (
                    <XStack
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                      borderRadius="$2"
                      paddingHorizontal="$1"
                      paddingVertical={2}
                    >
                      <Text
                        fontSize="$1"
                        color={isStale ? '$red11' : BRAND_GOLD_LIGHT}
                        fontWeight="700"
                      >
                        {p.playerPosition}
                      </Text>
                    </XStack>
                  )}
                  <Text
                    fontSize="$2"
                    color={isStale ? '$red11' : '$color'}
                    textDecorationLine={isStale ? 'line-through' : 'none'}
                  >
                    {p.playerName ?? 'Unknown Player'}
                  </Text>
                  {isStale && <AlertTriangle size={12} color="$red11" />}
                </XStack>
              );
            })
          )}
        </YStack>

        {/* Arrow divider */}
        <YStack alignItems="center" justifyContent="center" paddingTop="$4">
          <ArrowLeftRight size={16} color="$textMuted" opacity={0.5} />
        </YStack>

        {/* Receiving team gives */}
        <YStack flex={1} gap="$1">
          <Text
            fontSize="$1"
            color="$textMuted"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            {isIncoming
              ? 'You Give'
              : `${trade.receivingTeamName ?? 'They'} Give`}
          </Text>
          {requestingPlayers.length === 0 ? (
            <Text fontSize="$2" color="$textSubtle" fontStyle="italic">
              —
            </Text>
          ) : (
            requestingPlayers.map((p, index) => (
              <XStack
                key={p.id ?? `${p.playerId}-${p.fromTeamId}-${index}`}
                alignItems="center"
                gap="$1.5"
              >
                {p.playerPosition && (
                  <XStack
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                    borderRadius="$2"
                    paddingHorizontal="$1"
                    paddingVertical={2}
                  >
                    <Text
                      fontSize="$1"
                      color={BRAND_GOLD_LIGHT}
                      fontWeight="700"
                    >
                      {p.playerPosition}
                    </Text>
                  </XStack>
                )}
                <Text fontSize="$2" color="$color">
                  {p.playerName ?? 'Unknown Player'}
                </Text>
              </XStack>
            ))
          )}
        </YStack>
      </XStack>

      {/* Message */}
      {trade.message && (
        <XStack
          paddingHorizontal="$3"
          paddingBottom="$2"
          gap="$1.5"
          alignItems="flex-start"
        >
          <MessageSquare
            size={12}
            color="$textMuted"
            style={{ marginTop: 2 }}
          />
          <Text fontSize="$2" color="$textMuted" fontStyle="italic" flex={1}>
            "{trade.message}"
          </Text>
        </XStack>
      )}

      {/* Salary-cap preview — per-side salary delta + over-cap warning (LS-5971) */}
      {capPreview && (
        <YStack
          data-testid={`trade-cap-preview-${trade.id}`}
          borderTopWidth={1}
          borderTopColor="$outlineSubtle"
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$1.5"
        >
          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <XStack alignItems="center" gap="$1.5">
              <DollarSign size={12} color="$textMuted" />
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                You take on
              </Text>
              <Text
                fontSize="$2"
                color="$color"
                fontWeight="700"
                fontVariant={['tabular-nums']}
              >
                {formatSalary(capPreview.incomingSalary)}
              </Text>
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                · shed
              </Text>
              <Text
                fontSize="$2"
                color="$color"
                fontWeight="700"
                fontVariant={['tabular-nums']}
              >
                {formatSalary(capPreview.outgoingSalary)}
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$1.5">
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                Net
              </Text>
              <Text
                fontSize="$2"
                color={
                  capPreview.netSalaryDelta > 0
                    ? '$red11'
                    : capPreview.netSalaryDelta < 0
                      ? '$green11'
                      : '$textMuted'
                }
                fontWeight="700"
                fontVariant={['tabular-nums']}
              >
                {formatSalaryDelta(capPreview.netSalaryDelta)}
              </Text>
            </XStack>
          </XStack>
        </YStack>
      )}

      {/* Over-cap warning — accepting would exceed the league salary cap */}
      {capPreview?.exceedsCap && (
        <XStack
          data-testid={`trade-cap-warning-${trade.id}`}
          backgroundColor="$red2"
          borderTopWidth={1}
          borderTopColor="$red6"
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$1.5"
          alignItems="center"
        >
          <AlertTriangle size={12} color="$red11" />
          <Text color="$red11" fontSize="$2" flex={1}>
            This trade would put your team {formatSalary(capPreview.overCapBy)}{' '}
            over the salary cap
            {salaryCap != null ? ` (cap: ${formatSalary(salaryCap)})` : ''}.
          </Text>
        </XStack>
      )}

      {/* Roster fetch error — can't verify player eligibility, block Accept */}
      {hasRosterFetchError && (
        <XStack
          backgroundColor="$red2"
          borderTopWidth={1}
          borderTopColor="$red6"
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$1.5"
          alignItems="center"
        >
          <AlertTriangle size={12} color="$red11" />
          <Text color="$red11" fontSize="$2" flex={1}>
            Unable to verify this team's roster. Accepting is disabled.
          </Text>
        </XStack>
      )}

      {/* Stale player warning — shown when offered players are no longer on the proposing roster */}
      {isIncoming && trade.status === 'pending' && hasStaleOfferingPlayers && (
        <XStack
          backgroundColor="$red2"
          borderTopWidth={1}
          borderTopColor="$red6"
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$1.5"
          alignItems="center"
        >
          <AlertTriangle size={12} color="$red11" />
          <Text color="$red11" fontSize="$2" flex={1}>
            One or more offered players are no longer on this team's roster.
            Accepting will fail.
          </Text>
        </XStack>
      )}

      {/* League-member vote panel (LS-6349) — premium leagues: non-participating
          teams can vote approve/veto on an accepted trade during commissioner
          review, alongside the commissioner's standalone veto power. */}
      {isPremium && trade.status === 'accepted' && (
        <YStack
          data-testid={`trade-vote-panel-${trade.id}`}
          borderTopWidth={1}
          borderTopColor="$outlineSubtle"
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$1.5"
        >
          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <XStack alignItems="center" gap="$1.5">
              <Users size={12} color="$textMuted" />
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                League vote
              </Text>
              <Text fontSize="$2" color="$green11" fontWeight="700">
                {voteApproveCount} approve
              </Text>
              <Text fontSize="$1" color="$textMuted">
                ·
              </Text>
              <Text fontSize="$2" color="$statusAccentFg" fontWeight="700">
                {voteVetoCount} veto
              </Text>
              {trade.eligibleVoterCount != null && (
                <Text fontSize="$1" color="$textMuted">
                  (of {trade.eligibleVoterCount} eligible)
                </Text>
              )}
            </XStack>

            {isVoteEligible && (
              <XStack gap="$2" alignItems="center">
                <Button
                  size="$2"
                  backgroundColor={
                    viewerVote === 'approve' ? '$green4' : 'transparent'
                  }
                  borderColor="$green7"
                  borderWidth={1}
                  data-testid={`trade-vote-approve-${trade.id}`}
                  onPress={() => {
                    if (trade.id == null) return;
                    onVote?.(trade.id, TradeVoteChoice.Approve);
                  }}
                  disabled={isLoading || trade.id == null}
                  icon={<ThumbsUp size={12} color="$green11" />}
                >
                  <Text fontSize="$2" color="$green11" fontWeight="700">
                    Approve
                  </Text>
                </Button>
                <Button
                  size="$2"
                  backgroundColor={
                    viewerVote === 'veto' ? '$statusAccentBg' : 'transparent'
                  }
                  borderColor="$statusAccentBorder"
                  borderWidth={1}
                  data-testid={`trade-vote-veto-${trade.id}`}
                  onPress={() => {
                    if (trade.id == null) return;
                    onVote?.(trade.id, TradeVoteChoice.Veto);
                  }}
                  disabled={isLoading || trade.id == null}
                  icon={<ThumbsDown size={12} color="$statusAccentFg" />}
                >
                  <Text fontSize="$2" color="$statusAccentFg" fontWeight="700">
                    Veto
                  </Text>
                </Button>
              </XStack>
            )}
          </XStack>
        </YStack>
      )}

      {/* Footer: date + actions */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderTopWidth={1}
        borderTopColor="$outlineSubtle"
      >
        <Text fontSize="$1" color="$textMuted">
          {trade.status === 'accepted' && trade.respondedAt
            ? `Accepted ${formatDate(trade.respondedAt)}`
            : trade.status === 'rejected' && trade.respondedAt
              ? `Rejected ${formatDate(trade.respondedAt)}`
              : trade.status === 'vetoed' && trade.vetoedAt
                ? `Vetoed ${formatDate(trade.vetoedAt)}`
                : `Proposed ${formatDate(trade.createdAt)}`}
        </Text>

        <XStack gap="$2" alignItems="center">
          {/* Incoming pending → accept/reject */}
          {isIncoming && trade.status === 'pending' && (
            <>
              <Button
                size="$2"
                backgroundColor="$green4"
                borderColor="$green7"
                borderWidth={1}
                data-testid={`trade-accept-${trade.id}`}
                onPress={() => {
                  if (trade.id == null) return;
                  onAccept?.(trade.id);
                }}
                disabled={
                  isLoading ||
                  trade.id == null ||
                  hasStaleOfferingPlayers ||
                  hasRosterFetchError
                }
                icon={<Check size={12} color="$green11" />}
              >
                <Text fontSize="$2" color="$green11" fontWeight="700">
                  Accept
                </Text>
              </Button>
              <Button
                size="$2"
                backgroundColor="$red4"
                borderColor="$red7"
                borderWidth={1}
                data-testid={`trade-reject-${trade.id}`}
                onPress={() => {
                  if (trade.id == null) return;
                  onReject?.(trade.id);
                }}
                disabled={isLoading || trade.id == null}
                icon={<X size={12} color="$red11" />}
              >
                <Text fontSize="$2" color="$red11" fontWeight="700">
                  Reject
                </Text>
              </Button>
            </>
          )}

          {/* Outgoing pending → cancel */}
          {isOutgoing && trade.status === 'pending' && (
            <Button
              size="$2"
              backgroundColor="$gray4"
              borderColor="$gray7"
              borderWidth={1}
              data-testid={`trade-cancel-${trade.id}`}
              onPress={() => {
                if (trade.id == null) return;
                onCancel?.(trade.id);
              }}
              disabled={isLoading || trade.id == null}
              icon={<X size={12} color="$gray11" />}
            >
              <Text fontSize="$2" color="$gray11" fontWeight="600">
                Cancel
              </Text>
            </Button>
          )}

          {/* Commissioner veto on accepted trades */}
          {isCommissioner && trade.status === 'accepted' && (
            <Button
              size="$2"
              backgroundColor="$statusAccentBg"
              borderColor="$statusAccentBorder"
              borderWidth={1}
              data-testid={`trade-veto-${trade.id}`}
              onPress={() => {
                if (trade.id == null) return;
                onVeto?.(trade.id);
              }}
              disabled={isLoading || trade.id == null}
              icon={<Shield size={12} color="$statusAccentFg" />}
            >
              <Text fontSize="$2" color="$statusAccentFg" fontWeight="600">
                Veto
              </Text>
            </Button>
          )}

          {isLoading && <Spinner size="small" />}
        </XStack>
      </XStack>
    </GlassCard>
  );
}

// ── ProposeTradeDialog ────────────────────────────────────────────────────────

interface ProposeTradeDialogProps {
  leagueId: number;
  userTeamId: number;
  isPastDeadline: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
}

function ProposeTradeDialog({
  leagueId,
  userTeamId,
  isPastDeadline,
  onDismiss,
  onSuccess,
}: ProposeTradeDialogProps) {
  const [step, setStep] = useState<ProposeStep>('team');
  const [draft, setDraft] = useState<ProposalDraft>({
    receivingTeamId: null,
    offeringPlayerIds: [],
    requestingPlayerIds: [],
    message: '',
    expiresInDays: 3,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isNative = Platform.OS !== 'web';
  const { height: windowHeight } = useWindowDimensions();

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });

  const [loadMyPlayers, { data: myPlayersData, loading: myPlayersLoading }] =
    useGetTeamMembersLazyQuery();

  const [
    loadTheirPlayers,
    { data: theirPlayersData, loading: theirPlayersLoading },
  ] = useGetTeamMembersLazyQuery();

  const [proposeTrade] = useProposeTradeMutation();

  // Other teams in the league
  const otherTeams = useMemo(
    () => (teamsData?.leagueTeams ?? []).filter((t) => t.id !== userTeamId),
    [teamsData, userTeamId],
  );

  const selectedTeam = useMemo(
    () => otherTeams.find((t) => t.id === draft.receivingTeamId),
    [otherTeams, draft.receivingTeamId],
  );

  const myPlayers = myPlayersData?.teamMembers ?? [];
  const theirPlayers = theirPlayersData?.teamMembers ?? [];
  const hasValidRequest = theirPlayers.some(
    (tm) =>
      tm.playerId != null && draft.requestingPlayerIds.includes(tm.playerId),
  );

  // Requested players only exist on the chosen partner's roster, so switching
  // partners must drop them — otherwise Review/Send stay enabled for ids the
  // new partner doesn't own (LS-10814). Offered players are ours and survive.
  const handleSelectTeam = (teamId: number) => {
    setDraft((d) =>
      d.receivingTeamId === teamId
        ? d
        : { ...d, receivingTeamId: teamId, requestingPlayerIds: [] },
    );
    // Pre-load both rosters
    void loadMyPlayers({ variables: { teamId: userTeamId } });
    void loadTheirPlayers({ variables: { teamId } });
    setStep('offer');
  };

  const toggleOffering = (playerId: number) => {
    setDraft((d) => ({
      ...d,
      offeringPlayerIds: d.offeringPlayerIds.includes(playerId)
        ? d.offeringPlayerIds.filter((id) => id !== playerId)
        : [...d.offeringPlayerIds, playerId],
    }));
  };

  const toggleRequesting = (playerId: number) => {
    setDraft((d) => ({
      ...d,
      requestingPlayerIds: d.requestingPlayerIds.includes(playerId)
        ? d.requestingPlayerIds.filter((id) => id !== playerId)
        : [...d.requestingPlayerIds, playerId],
    }));
  };

  const handleSubmit = useCallback(async () => {
    if (isPastDeadline) {
      setErrorMsg('Trade deadline has passed. No new trades can be proposed.');
      return;
    }
    if (
      !draft.receivingTeamId ||
      draft.offeringPlayerIds.length === 0 ||
      draft.requestingPlayerIds.length === 0
    ) {
      setErrorMsg(
        'Please select at least one player on each side of the trade.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await proposeTrade({
        variables: {
          leagueId,
          receivingTeamId: draft.receivingTeamId,
          offeringPlayerIds: draft.offeringPlayerIds,
          requestingPlayerIds: draft.requestingPlayerIds,
          message: draft.message || null,
          expiresInDays: draft.expiresInDays,
        },
        // Insert the returned trade into the cached lists synchronously so
        // the UI doesn't depend on a post-mutation refetch that could hit a
        // Lambda/connection that hasn't yet observed the write.
        update: (cache, { data }) => {
          const created = data?.proposeTrade;
          if (!created) return;
          cache.updateQuery<
            GetTeamTradeOffersQuery,
            GetTeamTradeOffersQueryVariables
          >(
            {
              query: GetTeamTradeOffers,
              variables: { teamId: userTeamId, status: 'pending' },
            },
            (existing) => {
              const list = existing?.teamTradeOffers ?? [];
              if (list.some((t) => t.id === created.id)) return existing;
              return { teamTradeOffers: [...list, created] };
            },
          );
          cache.updateQuery<
            GetLeagueTradeOffersQuery,
            GetLeagueTradeOffersQueryVariables
          >(
            {
              query: GetLeagueTradeOffers,
              variables: { leagueId, limit: HISTORY_PAGE_SIZE, offset: 0 },
            },
            (existing) => {
              const list = existing?.leagueTradeOffers ?? [];
              if (list.some((t) => t.id === created.id)) return existing;
              return { leagueTradeOffers: [...list, created] };
            },
          );
        },
      });
      onSuccess();
    } catch (err) {
      LOGGER.error('Failed to propose trade', err as Error, {
        leagueId,
        userTeamId,
      });
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to propose trade.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [draft, isPastDeadline, leagueId, userTeamId, proposeTrade, onSuccess]);

  // Cycle through expiry options on press
  const currentExpiryIdx = EXPIRY_OPTIONS.findIndex(
    (o) => o.value === draft.expiresInDays,
  );
  const cycleExpiry = () => {
    const nextIdx = (currentExpiryIdx + 1) % EXPIRY_OPTIONS.length;
    setDraft((d) => ({ ...d, expiresInDays: EXPIRY_OPTIONS[nextIdx].value }));
  };
  const currentExpiryLabel =
    EXPIRY_OPTIONS[currentExpiryIdx >= 0 ? currentExpiryIdx : 0].label;

  // On web, anchor the overlay to the viewport (`fixed`) rather than the
  // document (`absolute`) — at a mobile viewport the trades panel is far
  // taller than the screen, so an `absolute` inset:0 overlay would span the
  // tall document and center itself around the document's middle, off the
  // current fold. (LS-8501)
  //
  // On native there is no `fixed`, and `absolute` only escapes the nearest
  // *positioned* ancestor — the Trades tab hosts TradingCenter inside a
  // ScrollView, so an inset:0 `absolute` overlay stretches over the tall
  // scroll content instead of the device viewport, leaving the dialog
  // unreachable. Rendering it inside React Native's `Modal` (same pattern as
  // apps/app/src/features/leagues/CreateLeagueModal.tsx) escapes the
  // ScrollView entirely — the Modal mounts its own top-level native window
  // above everything and wires the Android hardware back button to dismiss.
  // (LS-8852)
  const dialogOverlay = (
    <YStack
      position={Platform.OS === 'web' ? 'fixed' : undefined}
      top={Platform.OS === 'web' ? 0 : undefined}
      left={Platform.OS === 'web' ? 0 : undefined}
      right={Platform.OS === 'web' ? 0 : undefined}
      bottom={Platform.OS === 'web' ? 0 : undefined}
      flex={isNative ? 1 : undefined}
      zIndex={1000}
      alignItems="center"
      justifyContent="center"
      backgroundColor={withAlpha(BLACK, 0.6)}
      onPress={onDismiss}
    >
      <YStack
        role="dialog"
        aria-modal
        aria-label="Propose Trade"
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
        width={560}
        maxWidth="95%"
        // A percentage maxHeight only resolves against a parent with a
        // fixed/known height. On web the overlay above is viewport-`fixed`,
        // so `%` resolves against the viewport. On native the overlay is a
        // flex:1 child of the Modal with no intrinsic height until layout,
        // so derive an explicit pixel value from the window instead.
        maxHeight={isNative ? windowHeight * 0.85 : '85%'}
        gap="$4"
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
      >
        {/* Dialog header */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            <ArrowLeftRight size={18} color={BRAND_GOLD_LIGHT} />
            <Text fontSize="$5" fontWeight="700" color="$color">
              Propose Trade
            </Text>
          </XStack>
          <Button
            size="$2"
            backgroundColor="transparent"
            borderWidth={0}
            onPress={onDismiss}
            icon={<X size={16} color="$textMuted" />}
          />
        </XStack>

        {/* Step indicator */}
        <XStack gap="$2" alignItems="center">
          {(['team', 'offer', 'request', 'confirm'] as ProposeStep[]).map(
            (s, idx) => {
              const labels: Record<ProposeStep, string> = {
                team: 'Team',
                offer: 'Your Players',
                request: 'Their Players',
                confirm: 'Confirm',
              };
              const isActive = s === step;
              const stepOrder: Record<ProposeStep, number> = {
                team: 0,
                offer: 1,
                request: 2,
                confirm: 3,
              };
              const isDone = stepOrder[step] > stepOrder[s];

              return (
                <React.Fragment key={s}>
                  <XStack
                    alignItems="center"
                    gap="$1"
                    opacity={isActive ? 1 : isDone ? 0.8 : 0.4}
                  >
                    <YStack
                      width={18}
                      height={18}
                      borderRadius={9}
                      backgroundColor={
                        isDone
                          ? '$green9'
                          : isActive
                            ? BRAND_NAVY_LIGHT
                            : '$gray5'
                      }
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize="$1" color="white" fontWeight="700">
                        {isDone ? '✓' : idx + 1}
                      </Text>
                    </YStack>
                    <Text
                      fontSize="$2"
                      fontWeight={isActive ? '700' : '400'}
                      color={isActive ? '$color' : '$textMuted'}
                    >
                      {labels[s]}
                    </Text>
                  </XStack>
                  {idx < 3 && (
                    <ChevronRight size={12} color="$textMuted" opacity={0.5} />
                  )}
                </React.Fragment>
              );
            },
          )}
        </XStack>

        <Separator borderColor="$outlineSubtle" />

        {/* Step content */}
        <ScrollView flex={1} showsVerticalScrollIndicator={false}>
          {step === 'team' && (
            <YStack gap="$2">
              <Text fontSize="$3" color="$textMuted" marginBottom="$1">
                Select the team you want to trade with:
              </Text>
              {otherTeams.length === 0 && (
                <Text color="$textMuted" fontSize="$3">
                  No other teams in this league.
                </Text>
              )}
              {otherTeams
                .filter((team) => team.id != null)
                .map((team) => (
                  <Button
                    key={team.id}
                    backgroundColor="$surfaceSubtle"
                    borderColor={
                      draft.receivingTeamId === team.id
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                        : '$outlineSubtle'
                    }
                    borderWidth={1}
                    borderRadius="$4"
                    padding="$3"
                    onPress={() => {
                      if (team.id != null) handleSelectTeam(team.id);
                    }}
                    justifyContent="flex-start"
                    animation="quick"
                    hoverStyle={{
                      borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
                    }}
                    pressStyle={{ scale: 0.98 }}
                  >
                    <XStack alignItems="center" gap="$2">
                      <Users size={16} color={BRAND_GOLD_LIGHT} />
                      <Text fontSize="$3" fontWeight="600" color="$color">
                        {team.name}
                      </Text>
                    </XStack>
                  </Button>
                ))}
            </YStack>
          )}

          {step === 'offer' && (
            <YStack gap="$2">
              <Text fontSize="$3" color="$textMuted" marginBottom="$1">
                Select players{' '}
                <Text fontWeight="700" color="$color">
                  you will give
                </Text>{' '}
                to{' '}
                <Text fontWeight="700" color={BRAND_GOLD_LIGHT}>
                  {selectedTeam?.name}
                </Text>
                :
              </Text>
              {myPlayersLoading && <Spinner size="small" />}
              {myPlayers
                .filter((tm) => tm.playerId != null)
                .map((tm) => {
                  const pid = tm.playerId as number;
                  const name = tm.player
                    ? `${tm.player.firstName ?? ''} ${tm.player.lastName ?? ''}`.trim()
                    : String(pid);
                  const isSelected = draft.offeringPlayerIds.includes(pid);
                  return (
                    <Button
                      key={tm.id}
                      backgroundColor={
                        isSelected
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                          : '$surfaceSubtle'
                      }
                      borderColor={
                        isSelected
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                          : '$outlineSubtle'
                      }
                      borderWidth={1}
                      borderRadius="$4"
                      padding="$2.5"
                      onPress={() => toggleOffering(pid)}
                      justifyContent="flex-start"
                      animation="quick"
                      pressStyle={{ scale: 0.98 }}
                      hoverStyle={{
                        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
                      }}
                    >
                      <XStack alignItems="center" gap="$2" flex={1}>
                        {isSelected && (
                          <Check size={14} color={BRAND_GOLD_LIGHT} />
                        )}
                        <Text
                          fontSize="$3"
                          fontWeight={isSelected ? '700' : '400'}
                          color={isSelected ? BRAND_GOLD_LIGHT : '$color'}
                          flex={1}
                        >
                          {name}
                        </Text>
                        {tm.positionId == null && (
                          <XStack
                            backgroundColor="$amber3"
                            borderRadius="$2"
                            paddingHorizontal="$1"
                          >
                            <Text
                              fontSize="$1"
                              color="$amber11"
                              fontWeight="700"
                            >
                              BENCH
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                    </Button>
                  );
                })}
              <XStack gap="$2" marginTop="$2">
                <Button
                  flex={1}
                  data-testid="trade-dialog-back-to-team"
                  onPress={() => setStep('team')}
                  backgroundColor="$gray4"
                  borderRadius="$4"
                  animation="quick"
                  pressStyle={{ scale: 0.98 }}
                >
                  <Text fontSize="$3" fontWeight="600" color="$gray11">
                    ← Back
                  </Text>
                </Button>
                {draft.offeringPlayerIds.length > 0 && (
                  <Button
                    flex={2}
                    data-testid="trade-dialog-next-to-request"
                    onPress={() => setStep('request')}
                    backgroundColor={BRAND_NAVY_LIGHT}
                    borderRadius="$4"
                    animation="quick"
                    pressStyle={{ scale: 0.98 }}
                  >
                    <Text fontSize="$3" fontWeight="700" color="white">
                      Next — Select Their Players →
                    </Text>
                  </Button>
                )}
              </XStack>
            </YStack>
          )}

          {step === 'request' && (
            <YStack gap="$2">
              <Text fontSize="$3" color="$textMuted" marginBottom="$1">
                Select players you want{' '}
                <Text fontWeight="700" color={BRAND_GOLD_LIGHT}>
                  {selectedTeam?.name}
                </Text>{' '}
                to{' '}
                <Text fontWeight="700" color="$color">
                  give you
                </Text>
                :
              </Text>
              {theirPlayersLoading && <Spinner size="small" />}
              {theirPlayers
                .filter((tm) => tm.playerId != null)
                .map((tm) => {
                  const pid = tm.playerId as number;
                  const name = tm.player
                    ? `${tm.player.firstName ?? ''} ${tm.player.lastName ?? ''}`.trim()
                    : String(pid);
                  const isSelected = draft.requestingPlayerIds.includes(pid);
                  return (
                    <Button
                      key={tm.id}
                      backgroundColor={
                        isSelected ? '$green3' : '$surfaceSubtle'
                      }
                      borderColor={isSelected ? '$green7' : '$outlineSubtle'}
                      borderWidth={1}
                      borderRadius="$4"
                      padding="$2.5"
                      onPress={() => toggleRequesting(pid)}
                      justifyContent="flex-start"
                      animation="quick"
                      pressStyle={{ scale: 0.98 }}
                      hoverStyle={{ borderColor: '$green7' }}
                    >
                      <XStack alignItems="center" gap="$2" flex={1}>
                        {isSelected && <Check size={14} color="$green11" />}
                        <Text
                          fontSize="$3"
                          fontWeight={isSelected ? '700' : '400'}
                          color={isSelected ? '$green11' : '$color'}
                          flex={1}
                        >
                          {name}
                        </Text>
                        {tm.positionId == null && (
                          <XStack
                            backgroundColor="$amber3"
                            borderRadius="$2"
                            paddingHorizontal="$1"
                          >
                            <Text
                              fontSize="$1"
                              color="$amber11"
                              fontWeight="700"
                            >
                              BENCH
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                    </Button>
                  );
                })}
              <XStack gap="$2" marginTop="$2">
                <Button
                  flex={1}
                  data-testid="trade-dialog-back-to-offer"
                  onPress={() => setStep('offer')}
                  backgroundColor="$gray4"
                  borderRadius="$4"
                  animation="quick"
                  pressStyle={{ scale: 0.98 }}
                >
                  <Text fontSize="$3" fontWeight="600" color="$gray11">
                    ← Back
                  </Text>
                </Button>
                {hasValidRequest && (
                  <Button
                    flex={2}
                    data-testid="trade-dialog-review"
                    onPress={() => setStep('confirm')}
                    backgroundColor={BRAND_NAVY_LIGHT}
                    borderRadius="$4"
                    animation="quick"
                    pressStyle={{ scale: 0.98 }}
                  >
                    <Text fontSize="$3" fontWeight="700" color="white">
                      Review Trade →
                    </Text>
                  </Button>
                )}
              </XStack>
            </YStack>
          )}

          {step === 'confirm' && (
            <YStack gap="$3">
              {/* Trade summary */}
              <XStack gap="$3">
                <YStack flex={1} gap="$1">
                  <Text
                    fontSize="$2"
                    color="$textMuted"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    You Give
                  </Text>
                  {myPlayers
                    .filter(
                      (tm) =>
                        tm.playerId != null &&
                        draft.offeringPlayerIds.includes(tm.playerId),
                    )
                    .map((tm) => (
                      <Text key={tm.id} fontSize="$3" color="$color">
                        {tm.player
                          ? `${tm.player.firstName ?? ''} ${tm.player.lastName ?? ''}`.trim()
                          : `Player ${tm.playerId}`}
                      </Text>
                    ))}
                </YStack>
                <YStack alignItems="center" justifyContent="center">
                  <ArrowLeftRight size={18} color="$textMuted" opacity={0.4} />
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text
                    fontSize="$2"
                    color="$textMuted"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    You Get
                  </Text>
                  {theirPlayers
                    .filter(
                      (tm) =>
                        tm.playerId != null &&
                        draft.requestingPlayerIds.includes(tm.playerId),
                    )
                    .map((tm) => (
                      <Text key={tm.id} fontSize="$3" color="$color">
                        {tm.player
                          ? `${tm.player.firstName ?? ''} ${tm.player.lastName ?? ''}`.trim()
                          : `Player ${tm.playerId}`}
                      </Text>
                    ))}
                </YStack>
              </XStack>

              <Separator borderColor="$outlineSubtle" />

              {/* Message */}
              <YStack gap="$1">
                <Text fontSize="$2" color="$textMuted" fontWeight="600">
                  Message (optional)
                </Text>
                <Input
                  value={draft.message}
                  onChangeText={(text: string) =>
                    setDraft((d) => ({ ...d, message: text }))
                  }
                  placeholder="Add a message to your trade offer..."
                  maxLength={500}
                  multiline
                  numberOfLines={4}
                  borderColor="$outlineSubtle"
                  backgroundColor="$surfaceSubtle"
                  color="$color"
                  fontSize="$3"
                  borderRadius="$3"
                  padding="$2"
                />
              </YStack>

              {/* Expiry — cross-platform button picker */}
              <XStack alignItems="center" gap="$2">
                <Clock size={14} color="$textMuted" />
                <Text fontSize="$2" color="$textMuted">
                  Expires in:
                </Text>
                <Button
                  size="$2"
                  backgroundColor="$surfaceSubtle"
                  borderColor="$outlineSubtle"
                  borderWidth={1}
                  borderRadius="$3"
                  paddingHorizontal="$2"
                  onPress={cycleExpiry}
                >
                  <Text fontSize="$2" color="$color" fontWeight="600">
                    {currentExpiryLabel}
                  </Text>
                </Button>
              </XStack>

              {isPastDeadline && (
                <XStack
                  backgroundColor="$red2"
                  borderColor="$red6"
                  borderWidth={1}
                  borderRadius="$3"
                  padding="$2"
                  gap="$2"
                  alignItems="center"
                >
                  <Clock size={14} color="$red11" />
                  <Text color="$red11" fontSize="$2" fontWeight="600">
                    Trade deadline has passed
                  </Text>
                </XStack>
              )}

              {errorMsg && (
                <Text color="$red11" fontSize="$2">
                  {errorMsg}
                </Text>
              )}

              <XStack gap="$2">
                <Button
                  flex={1}
                  data-testid="trade-dialog-back-to-request"
                  onPress={() => setStep('request')}
                  backgroundColor="$gray4"
                  borderRadius="$4"
                  disabled={submitting}
                  animation="quick"
                  pressStyle={{ scale: 0.98 }}
                >
                  <Text fontSize="$3" fontWeight="600" color="$gray11">
                    ← Back
                  </Text>
                </Button>
                <Button
                  flex={2}
                  data-testid="trade-dialog-send"
                  onPress={() => void handleSubmit()}
                  backgroundColor={isPastDeadline ? '$gray6' : BRAND_NAVY_LIGHT}
                  borderRadius="$4"
                  disabled={submitting || isPastDeadline}
                  animation="quick"
                  pressStyle={{ scale: 0.98 }}
                  icon={
                    submitting ? (
                      <Spinner size="small" color="white" />
                    ) : (
                      <Send size={14} color="white" />
                    )
                  }
                >
                  <Text fontSize="$3" fontWeight="700" color="white">
                    {submitting ? 'Sending...' : 'Send Trade Offer'}
                  </Text>
                </Button>
              </XStack>
            </YStack>
          )}
        </ScrollView>
      </YStack>
    </YStack>
  );

  if (isNative) {
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
        testID="propose-trade-native-modal"
      >
        {dialogOverlay}
      </Modal>
    );
  }

  return dialogOverlay;
}

// ── TradingCenter (main component) ────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 25;

export function TradingCenter({
  leagueId,
  userTeamId,
  isCommissioner = false,
  isPremium = false,
  canUseTradeTools,
  onUpgradePremium,
  onSubscribeRefresh,
  deepLinkOfferId,
}: TradingCenterProps): React.JSX.Element {
  const [showProposeDialog, setShowProposeDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyTeamFilter, setHistoryTeamFilter] = useState<string>('');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('all');
  const [allHistoryTrades, setAllHistoryTrades] = useState<
    TradeOfferFragment[]
  >([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyFetchingMore, setHistoryFetchingMore] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: leagueData } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
    fetchPolicy: 'cache-first',
  });

  const isPastDeadline = useMemo(() => {
    const { tradeDeadlineWeek, currentWeekNumber } = leagueData?.league ?? {};
    if (tradeDeadlineWeek == null || currentWeekNumber == null) return false;
    return currentWeekNumber >= tradeDeadlineWeek;
  }, [leagueData]);

  // Salary-cap settings drive the TradeOfferCard cap preview (LS-5971).
  const salaryCapEnabled = leagueData?.league?.salaryCapEnabled ?? false;
  const salaryCap = leagueData?.league?.salaryCap ?? null;

  // The viewer's current payroll powers the over-cap warning. Only fetched for
  // cap-enabled leagues; skipped otherwise so non-premium leagues pay no cost.
  const { data: viewerTeamData } = useGetTeamByIdQuery({
    variables: { teamId: userTeamId },
    fetchPolicy: 'cache-and-network',
    skip: !salaryCapEnabled,
  });
  const viewerCurrentPayroll = viewerTeamData?.team?.totalPayroll ?? null;

  // Pending trades for the user's team
  const {
    data: pendingData,
    loading: pendingLoading,
    refetch: refetchPending,
  } = useGetTeamTradeOffersQuery({
    variables: { teamId: userTeamId, status: 'pending' },
    fetchPolicy: 'cache-and-network',
  });

  // All league trades for commissioner + history view
  const {
    data: allTradesData,
    loading: allLoading,
    refetch: refetchAll,
    fetchMore: fetchMoreHistory,
  } = useGetLeagueTradeOffersQuery({
    variables: { leagueId, limit: HISTORY_PAGE_SIZE, offset: 0 },
    fetchPolicy: 'cache-and-network',
    // Premium leagues also fetch eagerly so the "Under Review" vote panel
    // (LS-6349) is visible to every league member without opening history.
    skip: !isCommissioner && !isPremium && !showHistory,
  });

  // Deep-link lookup: fetch all statuses for the user's team when an offerId is
  // provided (e.g. from a push-notification link) so we can detect expired /
  // vetoed / cancelled offers and surface a clear "no longer available" state.
  const { data: deepLinkTradesData, loading: deepLinkLoading } =
    useGetTeamTradeOffersQuery({
      variables: { teamId: userTeamId },
      skip: deepLinkOfferId == null,
      fetchPolicy: 'cache-and-network',
    });

  const [acceptTrade] = useAcceptTradeMutation();
  const [rejectTrade] = useRejectTradeMutation();
  const [cancelTrade] = useCancelTradeMutation();
  const [vetoTrade] = useVetoTradeMutation();
  const [voteOnTrade] = useVoteOnTradeMutation();

  const handleRefetch = useCallback(async () => {
    await Promise.all([
      refetchPending(),
      isCommissioner || isPremium || showHistory
        ? refetchAll()
        : Promise.resolve(),
    ]);
  }, [refetchPending, refetchAll, isCommissioner, isPremium, showHistory]);

  const handleAction = useCallback(
    async (id: number, fn: (id: number) => Promise<unknown>) => {
      setActionLoading(id);
      setActionError(null);
      try {
        await fn(id);
        await handleRefetch();
      } catch (err) {
        LOGGER.error('Trade action failed', err as Error, { tradeId: id });
        setActionError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setActionLoading(null);
      }
    },
    [handleRefetch],
  );

  // ── Real-time refresh: delegate to caller via onSubscribeRefresh ──────────
  useEffect(() => {
    if (!onSubscribeRefresh) return;
    const cleanup = onSubscribeRefresh(() => {
      void handleRefetch();
    });
    return cleanup ?? undefined;
  }, [onSubscribeRefresh, handleRefetch]);

  const pendingTrades = pendingData?.teamTradeOffers ?? [];
  const incomingPending = pendingTrades.filter(
    (t) => t.receivingTeamId === userTeamId && t.proposingTeamId !== userTeamId,
  );
  const outgoingPending = pendingTrades.filter(
    (t) => t.proposingTeamId === userTeamId,
  );

  // Sync first page of history trades into accumulated state
  useEffect(() => {
    const fresh = allTradesData?.leagueTradeOffers ?? [];
    setAllHistoryTrades(fresh);
    setHasMoreHistory(fresh.length >= HISTORY_PAGE_SIZE);
  }, [allTradesData?.leagueTradeOffers]);

  const handleLoadMoreHistory = useCallback(async () => {
    setHistoryFetchingMore(true);
    try {
      const result = await fetchMoreHistory({
        variables: { offset: allHistoryTrades.length },
      });
      const next = result.data?.leagueTradeOffers ?? [];
      setAllHistoryTrades((prev) => [...prev, ...next]);
      setHasMoreHistory(next.length >= HISTORY_PAGE_SIZE);
    } finally {
      setHistoryFetchingMore(false);
    }
  }, [fetchMoreHistory, allHistoryTrades.length]);

  // All completed (non-pending) trades — unfiltered source for filters
  const historyAllTrades = useMemo(() => {
    return allHistoryTrades.filter((t) => t.status !== 'pending');
  }, [allHistoryTrades]);

  // Accepted trades still open for commissioner review / league vote
  // (LS-6349) — surfaced separately from the collapsed history so premium
  // league members see them without opening "Show History".
  const underReviewTrades = useMemo(() => {
    if (!isPremium) return [];
    return allHistoryTrades.filter((t) => t.status === 'accepted');
  }, [allHistoryTrades, isPremium]);

  // Unique teams that appear in any history trade (for the team filter dropdown)
  const historyTeamOptions = useMemo(() => {
    const teamMap = new Map<string, string>();
    for (const t of historyAllTrades) {
      if (t.proposingTeamId != null && t.proposingTeamName) {
        teamMap.set(String(t.proposingTeamId), t.proposingTeamName);
      }
      if (t.receivingTeamId != null && t.receivingTeamName) {
        teamMap.set(String(t.receivingTeamId), t.receivingTeamName);
      }
    }
    return Array.from(teamMap.entries())
      .map(([value, text]) => ({ value, text }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [historyAllTrades]);

  // History trades after applying status / team / date filters
  const historyTrades = useMemo(() => {
    let trades = historyAllTrades;

    if (historyStatusFilter !== 'all') {
      trades = trades.filter((t) => t.status === historyStatusFilter);
    }

    if (historyTeamFilter !== '') {
      const teamId = Number(historyTeamFilter);
      trades = trades.filter(
        (t) => t.proposingTeamId === teamId || t.receivingTeamId === teamId,
      );
    }

    if (historyDateFilter !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (historyDateFilter === '7d' ? 7 : 30));
      trades = trades.filter(
        (t) => t.createdAt != null && new Date(t.createdAt) >= cutoff,
      );
    }

    return trades;
  }, [
    historyAllTrades,
    historyStatusFilter,
    historyTeamFilter,
    historyDateFilter,
  ]);

  // Deep-link banner state
  const deepLinkOffer = useMemo(() => {
    if (deepLinkOfferId == null) return undefined;
    return deepLinkTradesData?.teamTradeOffers?.find(
      (t) => t.id === deepLinkOfferId,
    );
  }, [deepLinkOfferId, deepLinkTradesData]);

  // "unavailable" = found but not pending; "not-found" = loaded but absent
  const deepLinkUnavailable =
    deepLinkOfferId != null &&
    !deepLinkLoading &&
    deepLinkOffer != null &&
    deepLinkOffer.status !== 'pending';

  const deepLinkNotFound =
    deepLinkOfferId != null &&
    !deepLinkLoading &&
    deepLinkTradesData != null &&
    deepLinkOffer == null;

  return (
    <YStack
      role="tabpanel"
      id="panel-trades"
      aria-labelledby="tab-trades"
      gap="$4"
    >
      {/* Page header — flexWrap lets "Propose Trade" drop to its own line on
          narrow Android viewports instead of overflowing the screen edge (LS-8662) */}
      <XStack
        data-testid="trade-center-header"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="$2"
      >
        <XStack alignItems="center" gap="$2">
          <ArrowLeftRight size={22} color={BRAND_GOLD_LIGHT} />
          <YStack>
            <Text
              data-testid="trade-center-heading"
              fontSize="$6"
              fontWeight="700"
              color="$color"
            >
              Trading Center
            </Text>
            <Text fontSize="$2" color="$textMuted">
              Negotiate and execute player trades with other teams
            </Text>
          </YStack>
        </XStack>

        <Tooltip placement="bottom" delay={0}>
          <Tooltip.Trigger>
            <Button
              size="$3"
              backgroundColor={isPastDeadline ? '$gray6' : BRAND_NAVY_LIGHT}
              borderRadius="$4"
              onPress={() => {
                if (!isPastDeadline) setShowProposeDialog(true);
              }}
              disabled={isPastDeadline}
              animation="quick"
              pressStyle={{ scale: 0.97 }}
              hoverStyle={
                isPastDeadline
                  ? {}
                  : { backgroundColor: withAlpha(BRAND_NAVY, 1) }
              }
              icon={<Zap size={14} color="white" />}
            >
              <Text fontSize="$3" fontWeight="700" color="white">
                Propose Trade
              </Text>
            </Button>
          </Tooltip.Trigger>
          {isPastDeadline && (
            <Tooltip.Content
              backgroundColor="$gray9"
              borderRadius="$3"
              padding="$2"
              enterStyle={{ opacity: 0, scale: 0.9 }}
              exitStyle={{ opacity: 0, scale: 0.9 }}
              animation="quick"
            >
              <Tooltip.Arrow />
              <Text fontSize="$2" color="white">
                Trade deadline has passed
              </Text>
            </Tooltip.Content>
          )}
        </Tooltip>
      </XStack>

      {/* Roster limit lock (LS-10477): over-limit teams may only release. */}
      <RosterOverLimitNotice leagueId={leagueId} teamId={userTeamId} />

      {actionError && (
        <Card
          backgroundColor="$red2"
          borderColor="$red6"
          borderWidth={1}
          padding="$3"
          borderRadius="$4"
        >
          <Text color="$red11" fontSize="$3">
            {actionError}
          </Text>
        </Card>
      )}

      {/* Deep-link: offer no longer available */}
      {deepLinkUnavailable && (
        <Card
          testID="deep-link-unavailable-banner"
          backgroundColor="$amber2"
          borderColor="$amber6"
          borderWidth={1}
          padding="$3"
          borderRadius="$4"
          gap="$1"
        >
          <XStack alignItems="center" gap="$2">
            <AlertTriangle size={16} color="$amber9" />
            <Text color="$amber11" fontSize="$3" fontWeight="600">
              This trade is no longer available.
            </Text>
          </XStack>
          <Text color="$amber10" fontSize="$2">
            The trade offer you were directed to has been{' '}
            {deepLinkOffer?.status ?? 'resolved'} and can no longer be acted on.
          </Text>
        </Card>
      )}

      {/* Deep-link: offer not found */}
      {deepLinkNotFound && (
        <Card
          testID="deep-link-not-found-banner"
          backgroundColor="$gray2"
          borderColor="$gray6"
          borderWidth={1}
          padding="$3"
          borderRadius="$4"
          gap="$1"
        >
          <XStack alignItems="center" gap="$2">
            <AlertTriangle size={16} color="$gray9" />
            <Text color="$gray11" fontSize="$3" fontWeight="600">
              Trade not found.
            </Text>
          </XStack>
          <Text color="$gray10" fontSize="$2">
            This trade offer does not exist or you no longer have access to it.
          </Text>
        </Card>
      )}

      {/* Incoming offers */}
      <YStack data-testid="trade-tab-incoming" gap="$3">
        <XStack alignItems="center" gap="$2">
          <Clock size={16} color="$amber9" />
          <Text fontSize="$4" fontWeight="700" color="$color">
            Incoming Offers
          </Text>
          {incomingPending.length > 0 && (
            <XStack
              backgroundColor="$amber3"
              borderColor="$amber7"
              borderWidth={1}
              borderRadius="$10"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text fontSize="$1" fontWeight="700" color="$amber11">
                {incomingPending.length}
              </Text>
            </XStack>
          )}
        </XStack>

        {pendingLoading ? (
          <YStack alignItems="center" paddingVertical="$4">
            <Spinner size="small" />
          </YStack>
        ) : incomingPending.length === 0 ? (
          <Card
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            padding="$4"
            borderRadius="$5"
          >
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              No incoming trade offers. Keep an eye on your inbox!
            </Text>
          </Card>
        ) : (
          incomingPending.map((trade) => (
            <TradeOfferCard
              key={trade.id}
              trade={trade}
              userTeamId={userTeamId}
              isCommissioner={isCommissioner}
              highlighted={
                deepLinkOfferId != null && trade.id === deepLinkOfferId
              }
              onAccept={(id) =>
                void handleAction(id, (tradeId) =>
                  acceptTrade({ variables: { tradeId } }),
                )
              }
              onReject={(id) =>
                void handleAction(id, (tradeId) =>
                  rejectTrade({ variables: { tradeId } }),
                )
              }
              onVeto={(id) =>
                void handleAction(id, (tradeId) =>
                  vetoTrade({ variables: { tradeId } }),
                )
              }
              actionLoading={actionLoading}
              salaryCapEnabled={salaryCapEnabled}
              salaryCap={salaryCap}
              viewerCurrentPayroll={viewerCurrentPayroll}
            />
          ))
        )}
      </YStack>

      <Separator borderColor="$outlineSubtle" />

      {/* Outgoing offers */}
      <YStack data-testid="trade-tab-outgoing" gap="$3">
        <XStack alignItems="center" gap="$2">
          <Send size={16} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$4" fontWeight="700" color="$color">
            Outgoing Offers
          </Text>
          {outgoingPending.length > 0 && (
            <XStack
              backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
              borderWidth={1}
              borderRadius="$10"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text fontSize="$1" fontWeight="700" color={BRAND_GOLD_LIGHT}>
                {outgoingPending.length}
              </Text>
            </XStack>
          )}
        </XStack>

        {outgoingPending.length === 0 && !pendingLoading ? (
          <Card
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            padding="$4"
            borderRadius="$5"
          >
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              No outgoing offers. Ready to make a move? Hit "Propose Trade"!
            </Text>
          </Card>
        ) : (
          outgoingPending.map((trade) => (
            <TradeOfferCard
              key={trade.id}
              trade={trade}
              userTeamId={userTeamId}
              isCommissioner={isCommissioner}
              highlighted={
                deepLinkOfferId != null && trade.id === deepLinkOfferId
              }
              onCancel={(id) =>
                void handleAction(id, (tradeId) =>
                  cancelTrade({ variables: { tradeId } }),
                )
              }
              onVeto={(id) =>
                void handleAction(id, (tradeId) =>
                  vetoTrade({ variables: { tradeId } }),
                )
              }
              actionLoading={actionLoading}
              salaryCapEnabled={salaryCapEnabled}
              salaryCap={salaryCap}
              viewerCurrentPayroll={viewerCurrentPayroll}
            />
          ))
        )}
      </YStack>

      {/* Under Review — accepted trades open for commissioner veto / league
          vote (LS-6349, premium leagues). Surfaced outside the collapsed
          history so every member sees active review without extra clicks. */}
      {isPremium && underReviewTrades.length > 0 && (
        <>
          <Separator borderColor="$outlineSubtle" />
          <YStack data-testid="trade-tab-under-review" gap="$3">
            <XStack alignItems="center" gap="$2">
              <Shield size={16} color="$statusAccentFg" />
              <Text fontSize="$4" fontWeight="700" color="$color">
                Under Review
              </Text>
              <XStack
                backgroundColor="$statusAccentBg"
                borderColor="$statusAccentBorder"
                borderWidth={1}
                borderRadius="$10"
                paddingHorizontal="$2"
                paddingVertical={2}
              >
                <Text fontSize="$1" fontWeight="700" color="$statusAccentFg">
                  {underReviewTrades.length}
                </Text>
              </XStack>
            </XStack>
            <Text fontSize="$2" color="$textMuted">
              These trades were accepted and are open for commissioner veto and
              league vote before they're final.
            </Text>

            {underReviewTrades.map((trade) => (
              <TradeOfferCard
                key={trade.id}
                trade={trade}
                userTeamId={userTeamId}
                isCommissioner={isCommissioner}
                isPremium={isPremium}
                onVeto={
                  isCommissioner
                    ? (id) =>
                        void handleAction(id, (tradeId) =>
                          vetoTrade({ variables: { tradeId } }),
                        )
                    : undefined
                }
                onVote={(id, vote) =>
                  void handleAction(id, (tradeId) =>
                    voteOnTrade({ variables: { tradeId, vote } }),
                  )
                }
                actionLoading={actionLoading}
                salaryCapEnabled={salaryCapEnabled}
                salaryCap={salaryCap}
                viewerCurrentPayroll={viewerCurrentPayroll}
              />
            ))}
          </YStack>
        </>
      )}

      {/* Trade History */}
      <YStack gap="$3">
        <Button
          backgroundColor="transparent"
          borderWidth={0}
          onPress={() => setShowHistory((v) => !v)}
          paddingHorizontal={0}
          justifyContent="flex-start"
          alignSelf="flex-start"
        >
          <XStack alignItems="center" gap="$2">
            <History size={16} color="$textMuted" />
            <Text fontSize="$4" fontWeight="700" color="$textMuted">
              Trade History
            </Text>
            {showHistory ? (
              <ChevronUp size={14} color="$textMuted" />
            ) : (
              <ChevronDown size={14} color="$textMuted" />
            )}
          </XStack>
        </Button>

        {showHistory && (
          <YStack gap="$3">
            {/* Filter bar — only shown when there are history trades */}
            {historyAllTrades.length > 0 && (
              <YStack
                gap="$2"
                backgroundColor="$surfacePanel"
                borderColor="$surfacePanelBorder"
                borderWidth={1}
                borderRadius="$4"
                padding="$3"
              >
                <XStack alignItems="center" gap="$1.5">
                  <Filter size={12} color="$textMuted" />
                  <Text
                    fontSize="$1"
                    color="$textMuted"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Filter
                  </Text>
                </XStack>

                {/* Status chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$1.5">
                    {(
                      [
                        'all',
                        'accepted',
                        'rejected',
                        'vetoed',
                        'cancelled',
                        'expired',
                      ] as const
                    ).map((s) => {
                      const isActive = historyStatusFilter === s;
                      const badge = s === 'all' ? null : statusBadge(s);
                      return (
                        <XStack
                          key={s}
                          role="button"
                          tabIndex={0}
                          onPress={() => setHistoryStatusFilter(s)}
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setHistoryStatusFilter(s);
                            }
                          }}
                          backgroundColor={
                            isActive
                              ? (badge?.bg ?? '$surfaceInteractive')
                              : '$surfacePanel'
                          }
                          borderColor={
                            isActive
                              ? (badge?.border ?? '$outlineStrong')
                              : '$outlineSubtle'
                          }
                          borderWidth={1}
                          borderRadius="$10"
                          paddingHorizontal="$2.5"
                          paddingVertical="$1"
                          cursor="pointer"
                          pressStyle={{ opacity: 0.7 }}
                        >
                          <Text
                            fontSize="$1"
                            fontWeight={isActive ? '700' : '500'}
                            color={
                              isActive
                                ? (badge?.text ?? '$brandGoldLight')
                                : '$textMuted'
                            }
                          >
                            {s === 'all' ? 'All' : (badge?.label ?? s)}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </ScrollView>

                {/* Team + Date row */}
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  {/* Team dropdown */}
                  {historyTeamOptions.length > 0 && (
                    <XStack flex={1} minWidth={140} maxWidth={200}>
                      <Dropdown
                        aria-label="Filter by team"
                        value={historyTeamFilter}
                        onChange={setHistoryTeamFilter}
                        placeholder="All Teams"
                        items={[
                          { value: '', text: 'All Teams' },
                          ...historyTeamOptions,
                        ]}
                      />
                    </XStack>
                  )}

                  {/* Date chips */}
                  <XStack gap="$1.5">
                    {(
                      [
                        { value: 'all', label: 'All Time' },
                        { value: '30d', label: 'Last 30d' },
                        { value: '7d', label: 'Last 7d' },
                      ] as const
                    ).map(({ value, label }) => {
                      const isActive = historyDateFilter === value;
                      return (
                        <XStack
                          key={value}
                          role="button"
                          tabIndex={0}
                          onPress={() => setHistoryDateFilter(value)}
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setHistoryDateFilter(value);
                            }
                          }}
                          backgroundColor={
                            isActive ? '$surfaceInteractive' : '$surfacePanel'
                          }
                          borderColor={
                            isActive ? '$outlineStrong' : '$outlineSubtle'
                          }
                          borderWidth={1}
                          borderRadius="$10"
                          paddingHorizontal="$2.5"
                          paddingVertical="$1"
                          cursor="pointer"
                          pressStyle={{ opacity: 0.7 }}
                        >
                          <Text
                            fontSize="$1"
                            fontWeight={isActive ? '700' : '500'}
                            color={isActive ? '$brandGoldLight' : '$textMuted'}
                          >
                            {label}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </XStack>
              </YStack>
            )}

            {allLoading ? (
              <YStack alignItems="center" paddingVertical="$4">
                <Spinner size="small" />
              </YStack>
            ) : historyAllTrades.length === 0 ? (
              <Card
                backgroundColor="$surfacePanel"
                borderColor="$surfacePanelBorder"
                borderWidth={1}
                padding="$4"
                borderRadius="$5"
              >
                <Text color="$textMuted" fontSize="$3" textAlign="center">
                  No trade history yet.
                </Text>
              </Card>
            ) : historyTrades.length === 0 ? (
              <Card
                backgroundColor="$surfacePanel"
                borderColor="$surfacePanelBorder"
                borderWidth={1}
                padding="$4"
                borderRadius="$5"
              >
                <YStack alignItems="center" gap="$2">
                  <Text color="$textMuted" fontSize="$3" textAlign="center">
                    No trades match the selected filters.
                  </Text>
                  <Button
                    size="$2"
                    backgroundColor="transparent"
                    borderColor="$outlineSubtle"
                    onPress={() => {
                      setHistoryStatusFilter('all');
                      setHistoryTeamFilter('');
                      setHistoryDateFilter('all');
                    }}
                  >
                    <Text fontSize="$2" color="$textMuted">
                      Clear Filters
                    </Text>
                  </Button>
                </YStack>
              </Card>
            ) : (
              <>
                {historyTrades.map((trade) => (
                  <TradeOfferCard
                    key={trade.id}
                    trade={trade}
                    userTeamId={userTeamId}
                    isCommissioner={isCommissioner}
                    isPremium={isPremium}
                    highlighted={
                      deepLinkOfferId != null && trade.id === deepLinkOfferId
                    }
                    onVeto={
                      isCommissioner
                        ? (id) =>
                            void handleAction(id, (tradeId) =>
                              vetoTrade({ variables: { tradeId } }),
                            )
                        : undefined
                    }
                    onVote={(id, vote) =>
                      void handleAction(id, (tradeId) =>
                        voteOnTrade({ variables: { tradeId, vote } }),
                      )
                    }
                    actionLoading={actionLoading}
                    salaryCapEnabled={salaryCapEnabled}
                    salaryCap={salaryCap}
                    viewerCurrentPayroll={viewerCurrentPayroll}
                  />
                ))}
                {hasMoreHistory && (
                  <Button
                    size="$3"
                    backgroundColor="$surfacePanel"
                    borderColor="$outlineSubtle"
                    borderWidth={1}
                    disabled={historyFetchingMore}
                    onPress={() => void handleLoadMoreHistory()}
                  >
                    <Text fontSize="$3" color="$textMuted">
                      {historyFetchingMore ? 'Loading...' : 'Load more'}
                    </Text>
                  </Button>
                )}
              </>
            )}
          </YStack>
        )}
      </YStack>

      <Separator borderColor="$outlineSubtle" />

      {/* Premium Trade Tools */}
      <PremiumTradeTools
        userTeamId={userTeamId}
        pendingTrades={pendingTrades}
        isPremium={canUseTradeTools ?? isPremium}
        onUpgrade={onUpgradePremium}
      />

      <Separator borderColor="$outlineSubtle" />

      {/* Trade Block */}
      <LeagueTradeBlock leagueId={leagueId} userTeamId={userTeamId} />

      {/* Propose trade dialog */}
      {showProposeDialog && (
        <ProposeTradeDialog
          leagueId={leagueId}
          userTeamId={userTeamId}
          isPastDeadline={isPastDeadline}
          onDismiss={() => setShowProposeDialog(false)}
          onSuccess={() => {
            setShowProposeDialog(false);
            // No refetch here — the mutation's `update` callback has already
            // written the new offer into the cache. A network refetch could
            // hit a replica/Lambda that hasn't observed the commit yet and
            // overwrite the pending list with stale data.
          }}
        />
      )}
    </YStack>
  );
}
