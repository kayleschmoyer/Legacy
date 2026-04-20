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
import {
  Card,
  type CardProps,
  Input,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  History,
  MessageSquare,
  Send,
  Shield,
  Users,
  X,
  Zap,
} from '@tamagui/lucide-icons';
import { Button } from '../../Button';
import {
  GetLeagueTradeOffers,
  type GetLeagueTradeOffersQuery,
  type GetLeagueTradeOffersQueryVariables,
  GetTeamTradeOffers,
  type GetTeamTradeOffersQuery,
  type GetTeamTradeOffersQueryVariables,
  TradeOfferFragment,
  useAcceptTradeMutation,
  useCancelTradeMutation,
  useGetLeagueTeamsQuery,
  useGetLeagueTradeOffersQuery,
  useGetTeamMembersLazyQuery,
  useGetTeamTradeOffersQuery,
  useProposeTradeMutation,
  useRejectTradeMutation,
  useVetoTradeMutation,
} from '../../api/db/graphql.generated';
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
  /**
   * Optional callback invoked when real-time events (trade offers, roster
   * updates) should trigger a data refresh.  On web this is wired to
   * `useLeagueWebSocket`; on mobile the caller can provide its own push
   * notification or polling mechanism.  When omitted the component still
   * works — users just need to manually refresh.
   */
  onSubscribeRefresh?: (refetch: () => void) => (() => void) | void;
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
        bg: '$purple3',
        border: '$purple7',
        text: '$purple11',
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
  onAccept?: (id: number) => void;
  onReject?: (id: number) => void;
  onCancel?: (id: number) => void;
  onVeto?: (id: number) => void;
  actionLoading?: number | null;
}

function TradeOfferCard({
  trade,
  userTeamId,
  isCommissioner,
  onAccept,
  onReject,
  onCancel,
  onVeto,
  actionLoading,
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

  const isLoading = actionLoading === trade.id;

  const statusBarColor =
    trade.status === 'pending'
      ? '$amber9'
      : trade.status === 'accepted'
        ? '$green9'
        : trade.status === 'vetoed'
          ? '$purple9'
          : '$gray9';

  return (
    <GlassCard
      backgroundColor={withAlpha(SURFACE_PANEL, 0.65)}
      borderColor={badge.border}
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
            offeringPlayers.map((p, index) => (
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
                onPress={() => {
                  if (trade.id == null) return;
                  onAccept?.(trade.id);
                }}
                disabled={isLoading || trade.id == null}
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
              backgroundColor="$purple4"
              borderColor="$purple7"
              borderWidth={1}
              onPress={() => {
                if (trade.id == null) return;
                onVeto?.(trade.id);
              }}
              disabled={isLoading || trade.id == null}
              icon={<Shield size={12} color="$purple11" />}
            >
              <Text fontSize="$2" color="$purple11" fontWeight="600">
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
  onDismiss: () => void;
  onSuccess: () => void;
}

function ProposeTradeDialog({
  leagueId,
  userTeamId,
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

  const handleSelectTeam = (teamId: number) => {
    setDraft((d) => ({ ...d, receivingTeamId: teamId }));
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
            { query: GetLeagueTradeOffers, variables: { leagueId } },
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
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to propose trade.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [draft, leagueId, userTeamId, proposeTrade, onSuccess]);

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

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={1000}
      alignItems="center"
      justifyContent="center"
      backgroundColor={withAlpha(BLACK, 0.6)}
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
        maxHeight="85%"
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
              {draft.offeringPlayerIds.length > 0 && (
                <Button
                  marginTop="$2"
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
                {draft.requestingPlayerIds.length > 0 && (
                  <Button
                    flex={2}
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

              {errorMsg && (
                <Text color="$red11" fontSize="$2">
                  {errorMsg}
                </Text>
              )}

              <XStack gap="$2">
                <Button
                  flex={1}
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
                  onPress={() => void handleSubmit()}
                  backgroundColor={BRAND_NAVY_LIGHT}
                  borderRadius="$4"
                  disabled={submitting}
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
}

// ── TradingCenter (main component) ────────────────────────────────────────────

export function TradingCenter({
  leagueId,
  userTeamId,
  isCommissioner = false,
  onSubscribeRefresh,
}: TradingCenterProps): React.JSX.Element {
  const [showProposeDialog, setShowProposeDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  } = useGetLeagueTradeOffersQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
    skip: !isCommissioner && !showHistory,
  });

  const [acceptTrade] = useAcceptTradeMutation();
  const [rejectTrade] = useRejectTradeMutation();
  const [cancelTrade] = useCancelTradeMutation();
  const [vetoTrade] = useVetoTradeMutation();

  const handleRefetch = useCallback(async () => {
    await Promise.all([
      refetchPending(),
      isCommissioner || showHistory ? refetchAll() : Promise.resolve(),
    ]);
  }, [refetchPending, refetchAll, isCommissioner, showHistory]);

  const handleAction = useCallback(
    async (id: number, fn: (id: number) => Promise<unknown>) => {
      setActionLoading(id);
      setActionError(null);
      try {
        await fn(id);
        await handleRefetch();
      } catch (err) {
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

  // History: completed trades from the league view
  const historyTrades = useMemo(() => {
    const all = allTradesData?.leagueTradeOffers ?? [];
    return all.filter((t) => t.status !== 'pending');
  }, [allTradesData]);

  return (
    <YStack
      role="tabpanel"
      id="panel-trades"
      aria-labelledby="tab-trades"
      gap="$4"
    >
      {/* Page header */}
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <ArrowLeftRight size={22} color={BRAND_GOLD_LIGHT} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color="$color">
              Trading Center
            </Text>
            <Text fontSize="$2" color="$textMuted">
              Negotiate and execute player trades with other teams
            </Text>
          </YStack>
        </XStack>

        <Button
          size="$3"
          backgroundColor={BRAND_NAVY_LIGHT}
          borderRadius="$4"
          onPress={() => setShowProposeDialog(true)}
          animation="quick"
          pressStyle={{ scale: 0.97 }}
          hoverStyle={{ backgroundColor: withAlpha(BRAND_NAVY, 1) }}
          icon={<Zap size={14} color="white" />}
        >
          <Text fontSize="$3" fontWeight="700" color="white">
            Propose Trade
          </Text>
        </Button>
      </XStack>

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

      {/* Incoming offers */}
      <YStack gap="$3">
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
            />
          ))
        )}
      </YStack>

      <Separator borderColor="$outlineSubtle" />

      {/* Outgoing offers */}
      <YStack gap="$3">
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
            />
          ))
        )}
      </YStack>

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
            {allLoading ? (
              <YStack alignItems="center" paddingVertical="$4">
                <Spinner size="small" />
              </YStack>
            ) : historyTrades.length === 0 ? (
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
            ) : (
              historyTrades.map((trade) => (
                <TradeOfferCard
                  key={trade.id}
                  trade={trade}
                  userTeamId={userTeamId}
                  isCommissioner={isCommissioner}
                  onVeto={
                    isCommissioner
                      ? (id) =>
                          void handleAction(id, (tradeId) =>
                            vetoTrade({ variables: { tradeId } }),
                          )
                      : undefined
                  }
                  actionLoading={actionLoading}
                />
              ))
            )}
          </YStack>
        )}
      </YStack>

      {/* Propose trade dialog */}
      {showProposeDialog && (
        <ProposeTradeDialog
          leagueId={leagueId}
          userTeamId={userTeamId}
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
