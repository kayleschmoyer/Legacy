import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  Input,
  ScrollView,
  Separator,
  Spinner,
  styled,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  DollarSign,
  UserMinus,
  UserPlus,
} from '@tamagui/lucide-icons';
import {
  type TeamMemberFragment,
  useClaimFreeAgentMutation,
  useGetTeamMembersQuery,
} from '../../api/db/graphql.generated';
import { useAppSelector } from '../../store/hooks';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

/* ── Styled ────────────────────────────────────────────────────────────────── */

const PositionBadge = styled(XStack, {
  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
  borderWidth: 1,
  borderRadius: '$2',
  paddingHorizontal: '$2',
  paddingVertical: '$0.5',
  alignItems: 'center',
  justifyContent: 'center',
});

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface WaiverClaimModalProps {
  open: boolean;
  onClose: () => void;
  /** The player being claimed from free agency */
  player: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: string[] | null;
  };
  leagueId: number;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export const WaiverClaimModal: React.FC<WaiverClaimModalProps> = ({
  open,
  onClose,
  player,
  leagueId,
}) => {
  const [dropPlayerId, setDropPlayerId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [faabBidInput, setFaabBidInput] = useState('');

  const userTeamId = useAppSelector((s) => s.league.userTeamId);
  const maxRosterSize = useAppSelector(
    (s) => s.league.leagueData?.maxRosterSize ?? 25,
  );
  const waiverType = useAppSelector(
    (s) => s.league.leagueData?.waiverType ?? 'standard',
  );
  const faabBudgetDefault = useAppSelector(
    (s) => s.league.leagueData?.faabBudgetDefault ?? 100,
  );
  const isFaab = waiverType === 'faab';

  // When userTeamId hasn't loaded yet, skip the roster query but treat the
  // modal as loading — prevents a false "Roster has space (0/25)" state that
  // would skip the required drop-player step (LS-4226).
  const rosterUnknown = userTeamId === null;

  const { data: rosterData, loading: rosterLoading } = useGetTeamMembersQuery({
    variables: { teamId: userTeamId ?? 0 },
    skip: !userTeamId || !open,
    fetchPolicy: 'network-only',
  });

  const [claimFreeAgent, { loading: claiming }] = useClaimFreeAgentMutation();

  const roster = useMemo(() => rosterData?.teamMembers ?? [], [rosterData]);

  const rosterFull = roster.length >= maxRosterSize;

  const parsedFaabBid = useMemo(() => {
    const val = parseInt(faabBidInput, 10);
    return isNaN(val) ? null : val;
  }, [faabBidInput]);

  const canSubmit = useMemo(() => {
    if (claiming || success) return false;
    if (rosterLoading || rosterUnknown) return false;
    if (rosterFull && !dropPlayerId) return false;
    if (isFaab && (parsedFaabBid == null || parsedFaabBid < 0)) return false;
    return true;
  }, [
    claiming,
    success,
    rosterLoading,
    rosterUnknown,
    rosterFull,
    dropPlayerId,
    isFaab,
    parsedFaabBid,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitError(null);

    try {
      await claimFreeAgent({
        variables: {
          leagueId,
          playerId: player.id,
          dropPlayerId: dropPlayerId ?? undefined,
          faabBid: isFaab ? (parsedFaabBid ?? undefined) : undefined,
        },
        // claimFreeAgent returns the new WaiverClaim entity, but Apollo's
        // normalized cache can't know which list queries it belongs to.
        // Refetch the team's waiver list and the league activity feed by
        // name so every active observer updates regardless of variables
        // (LS-3769). awaitRefetchQueries intentionally omitted — the
        // refetches run in the background so setSuccess(true) fires as
        // soon as the mutation resolves, not after the refetches complete
        // (LS-4213).
        refetchQueries: ['GetTeamWaiverClaims', 'GetLeagueActivity'],
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to claim player',
      );
    }
  }, [
    canSubmit,
    claimFreeAgent,
    leagueId,
    player.id,
    dropPlayerId,
    isFaab,
    parsedFaabBid,
  ]);

  const handleClose = useCallback(() => {
    setDropPlayerId(null);
    setSubmitError(null);
    setSuccess(false);
    setFaabBidInput('');
    onClose();
  }, [onClose]);

  const playerName =
    `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          animation="quick"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          bordered
          elevate
          maxWidth={520}
          width="100%"
          backgroundColor="$color2"
          borderColor="$borderColor"
          animation="quick"
          enterStyle={{ opacity: 0, y: -10 }}
          exitStyle={{ opacity: 0, y: 10 }}
          aria-labelledby="claim-title"
        >
          {success ? (
            /* ── Success State ─────────────────────────────────── */
            <YStack alignItems="center" gap="$4" padding="$4">
              <XStack
                width={48}
                height={48}
                borderRadius={24}
                backgroundColor="$green4"
                alignItems="center"
                justifyContent="center"
              >
                <Check size={24} color="$green10" />
              </XStack>
              <YStack alignItems="center" gap="$2">
                <Text fontSize="$5" fontWeight="700" color="$color12">
                  Waiver Claim Submitted!
                </Text>
                <Text fontSize="$3" color="$color10" textAlign="center">
                  Your claim for {playerName} has been submitted and will be
                  processed shortly.
                </Text>
              </YStack>
              <Button
                onPress={handleClose}
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                size="$4"
                borderRadius="$3"
              >
                <Text color="white" fontWeight="600">
                  Done
                </Text>
              </Button>
            </YStack>
          ) : (
            /* ── Claim Form ────────────────────────────────────── */
            <YStack gap="$4">
              {/* Header */}
              <YStack gap="$1">
                <Text
                  id="claim-title"
                  fontSize="$6"
                  fontWeight="700"
                  color="$color12"
                >
                  Claim Free Agent
                </Text>
                <Text fontSize="$3" color="$color10">
                  Submit a waiver claim for {playerName}
                </Text>
              </YStack>

              {/* Player being added */}
              <XStack
                backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
                borderWidth={1}
                borderRadius="$3"
                padding="$3"
                alignItems="center"
                gap="$3"
              >
                <XStack
                  width={36}
                  height={36}
                  borderRadius={18}
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                  alignItems="center"
                  justifyContent="center"
                >
                  <UserPlus size={18} color={BRAND_NAVY_LIGHT} />
                </XStack>
                <YStack flex={1} gap="$0.5">
                  <Text fontWeight="700" fontSize="$4" color={BRAND_GOLD_LIGHT}>
                    {playerName}
                  </Text>
                  {player.eligiblePositions &&
                    player.eligiblePositions.length > 0 && (
                      <XStack flexWrap="wrap" gap="$1">
                        {player.eligiblePositions.map((pos) => (
                          <PositionBadge key={pos}>
                            <Text
                              fontSize={10}
                              fontWeight="700"
                              color={BRAND_GOLD_LIGHT}
                            >
                              {pos}
                            </Text>
                          </PositionBadge>
                        ))}
                      </XStack>
                    )}
                </YStack>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$green10"
                  textTransform="uppercase"
                >
                  Adding
                </Text>
              </XStack>

              {/* Roster status / drop player section */}
              {rosterLoading || rosterUnknown ? (
                <YStack alignItems="center" padding="$4">
                  <Spinner size="small" color={BRAND_NAVY_LIGHT} />
                  <Text fontSize="$2" color="$color9" marginTop="$2">
                    Loading roster…
                  </Text>
                </YStack>
              ) : rosterFull ? (
                <YStack gap="$2">
                  <XStack alignItems="center" gap="$2">
                    <ArrowRightLeft size={14} color="$orange10" />
                    <Text fontSize="$3" fontWeight="600" color="$orange10">
                      Roster full ({roster.length}/{maxRosterSize}) — select a
                      player to drop
                    </Text>
                  </XStack>

                  <ScrollView
                    maxHeight={260}
                    borderWidth={1}
                    borderColor="$borderColor"
                    borderRadius="$3"
                  >
                    {roster.map((member: TeamMemberFragment) => {
                      const mp = member.player;
                      if (!mp) return null;
                      const isSelected = dropPlayerId === mp.id;
                      const memberName =
                        `${mp.firstName ?? ''} ${mp.lastName ?? ''}`.trim();

                      return (
                        <XStack
                          key={member.id}
                          padding="$3"
                          alignItems="center"
                          gap="$3"
                          borderBottomWidth={1}
                          borderBottomColor="$borderColor"
                          backgroundColor={isSelected ? '$red2' : 'transparent'}
                          hoverStyle={{
                            backgroundColor: isSelected ? '$red3' : '$color2',
                          }}
                          pressStyle={{
                            backgroundColor: isSelected ? '$red3' : '$color3',
                          }}
                          cursor="pointer"
                          testID={`drop-player-${mp.id}`}
                          role="option"
                          aria-selected={isSelected}
                          aria-label={`Drop ${memberName}`}
                          onPress={() =>
                            setDropPlayerId(isSelected ? null : (mp.id ?? null))
                          }
                        >
                          <XStack
                            width={28}
                            height={28}
                            borderRadius={14}
                            backgroundColor={isSelected ? '$red4' : '$color3'}
                            alignItems="center"
                            justifyContent="center"
                          >
                            {isSelected ? (
                              <UserMinus size={14} color="$red10" />
                            ) : (
                              <Text
                                fontSize={11}
                                fontWeight="700"
                                color="$color9"
                              >
                                {(mp.firstName ?? '')[0]}
                                {(mp.lastName ?? '')[0]}
                              </Text>
                            )}
                          </XStack>

                          <YStack flex={1} gap="$0.5">
                            <XStack
                              alignItems="center"
                              gap="$2"
                              flexWrap="wrap"
                            >
                              <Text
                                fontWeight="600"
                                fontSize="$3"
                                color={isSelected ? '$red11' : '$color12'}
                              >
                                {memberName}
                              </Text>
                              {mp.eligiblePositions &&
                                mp.eligiblePositions.length > 0 && (
                                  <XStack flexWrap="wrap" gap="$0.5">
                                    {mp.eligiblePositions.map((pos) => (
                                      <PositionBadge key={pos}>
                                        <Text
                                          fontSize={9}
                                          fontWeight="700"
                                          color={BRAND_GOLD_LIGHT}
                                        >
                                          {pos}
                                        </Text>
                                      </PositionBadge>
                                    ))}
                                  </XStack>
                                )}
                            </XStack>
                            <XStack gap="$2">
                              {mp.seasonsPlayed != null && (
                                <Text fontSize={10} color="$color8">
                                  {mp.seasonsPlayed}{' '}
                                  {mp.seasonsPlayed === 1
                                    ? 'season'
                                    : 'seasons'}
                                </Text>
                              )}
                              {mp.careerBatting?.games != null && (
                                <Text fontSize={10} color="$color8">
                                  {mp.careerBatting.games} career G
                                </Text>
                              )}
                              {member.salary != null && member.salary > 0 && (
                                <Text fontSize={10} color="$color8">
                                  ${member.salary.toLocaleString()}
                                </Text>
                              )}
                            </XStack>
                          </YStack>

                          {isSelected && (
                            <Text
                              fontSize="$2"
                              fontWeight="600"
                              color="$red10"
                              textTransform="uppercase"
                            >
                              Dropping
                            </Text>
                          )}
                        </XStack>
                      );
                    })}
                  </ScrollView>
                </YStack>
              ) : (
                <XStack
                  backgroundColor="$green2"
                  borderColor="$green6"
                  borderWidth={1}
                  borderRadius="$3"
                  padding="$3"
                  alignItems="center"
                  gap="$2"
                >
                  <Check size={14} color="$green10" />
                  <Text fontSize="$3" color="$green10">
                    Roster has space ({roster.length}/{maxRosterSize})
                  </Text>
                </XStack>
              )}

              {/* FAAB Bid Input */}
              {isFaab && (
                <YStack gap="$2">
                  <XStack alignItems="center" gap="$2">
                    <DollarSign size={14} color={BRAND_NAVY_LIGHT} />
                    <Text fontSize="$3" fontWeight="600" color="$color12">
                      FAAB Bid Amount
                    </Text>
                  </XStack>
                  <Text fontSize="$2" color="$color9">
                    League budget: ${faabBudgetDefault} per team. Higher bids
                    win.
                  </Text>
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$4" fontWeight="700" color="$color10">
                      $
                    </Text>
                    <Input
                      flex={1}
                      size="$4"
                      value={faabBidInput}
                      onChangeText={(text: string) =>
                        setFaabBidInput(text.replace(/[^0-9]/g, ''))
                      }
                      placeholder="0"
                      keyboardType="numeric"
                      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
                      borderWidth={1}
                      borderRadius="$3"
                    />
                  </XStack>
                </YStack>
              )}

              {/* Error */}
              {submitError && (
                <XStack
                  backgroundColor="$red2"
                  borderColor="$red6"
                  borderWidth={1}
                  borderRadius="$3"
                  padding="$3"
                  alignItems="center"
                  gap="$2"
                >
                  <AlertCircle size={14} color="$red10" />
                  <Text fontSize="$3" color="$red10" flex={1}>
                    {submitError}
                  </Text>
                </XStack>
              )}

              <Separator />

              {/* Actions */}
              <XStack justifyContent="flex-end" gap="$3">
                <Dialog.Close asChild>
                  <Button size="$3" disabled={claiming} chromeless>
                    <Text color="$color10">Cancel</Text>
                  </Button>
                </Dialog.Close>
                <Button
                  size="$3"
                  backgroundColor={canSubmit ? BRAND_NAVY_LIGHT : '$color4'}
                  disabled={!canSubmit}
                  onPress={() => void handleSubmit()}
                  icon={
                    claiming ? (
                      <Spinner size="small" color="white" />
                    ) : undefined
                  }
                  borderRadius="$3"
                >
                  <Text
                    color={canSubmit ? 'white' : '$color8'}
                    fontWeight="600"
                  >
                    {claiming
                      ? 'Submitting…'
                      : !rosterUnknown && rosterFull && dropPlayerId
                        ? 'Submit Claim & Drop'
                        : 'Submit Claim'}
                  </Text>
                </Button>
              </XStack>
            </YStack>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};
