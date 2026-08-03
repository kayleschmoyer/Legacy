import React, { useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Card, Input, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Plus,
} from '@tamagui/lucide-icons';
import {
  type TeamMemberFragment,
  useGetLeagueTradeBlockQuery,
  useGetTeamMembersQuery,
  useSetTradeBlockMutation,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';
import { Button } from '../../Button';

export interface LeagueTradeBlockProps {
  leagueId: number;
  /** The current user's team ID -- used to determine which toggle buttons to show. */
  userTeamId: number | null | undefined;
}

function formatPlayerName(member: TeamMemberFragment): string {
  if (!member.player) return `Player #${member.playerId}`;
  return `${member.player.firstName ?? ''} ${member.player.lastName ?? ''}`.trim();
}

/**
 * LeagueTradeBlock -- Displays all players listed on the trade block across
 * every team in the league. GMs and assistant managers can toggle their own
 * players on/off the trade block directly from this widget.
 */
export function LeagueTradeBlock({
  leagueId,
  userTeamId,
}: LeagueTradeBlockProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const { data, loading, error } = useGetLeagueTradeBlockQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const [setTradeBlock, { loading: mutating }] = useSetTradeBlockMutation({
    refetchQueries: ['GetLeagueTradeBlock'],
  });

  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [addExpanded, setAddExpanded] = useState(false);
  const [selectedAddId, setSelectedAddId] = useState<number | null>(null);
  const [addPriceInput, setAddPriceInput] = useState('');

  const {
    data: rosterData,
    loading: rosterLoading,
    error: rosterError,
  } = useGetTeamMembersQuery({
    variables: { teamId: userTeamId ?? 0 },
    skip: userTeamId == null || !addExpanded,
  });

  const blockedMemberIds = useMemo(
    () => new Set((data?.leagueTradeBlock ?? []).map((member) => member.id)),
    [data],
  );

  const rosterAvailableToAdd = (rosterData?.teamMembers ?? []).filter(
    (member) => member.id != null && !blockedMemberIds.has(member.id),
  );

  const handleSavePrice = async (memberId: number) => {
    setMutationError(null);
    try {
      await setTradeBlock({
        variables: {
          teamMemberId: memberId,
          onTradeBlock: true,
          askingPrice: priceInput || null,
        },
      });
      setEditingPriceId(null);
      setPriceInput('');
    } catch (error) {
      LOGGER.error('Failed to update asking price', error as Error);
      setMutationError('Failed to update asking price. Please try again.');
    }
  };

  const handleRemove = async (memberId: number) => {
    setMutationError(null);
    try {
      await setTradeBlock({
        variables: {
          teamMemberId: memberId,
          onTradeBlock: false,
        },
      });
    } catch (error) {
      LOGGER.error('Failed to remove player from trade block', error as Error);
      setMutationError(
        'Failed to remove player from trade block. Please try again.',
      );
    }
  };

  const handleAddToBlock = async () => {
    if (selectedAddId == null) return;
    setMutationError(null);
    try {
      await setTradeBlock({
        variables: {
          teamMemberId: selectedAddId,
          onTradeBlock: true,
          askingPrice: addPriceInput || null,
        },
      });
      setAddExpanded(false);
      setSelectedAddId(null);
      setAddPriceInput('');
    } catch (error) {
      LOGGER.error(
        'Failed to add player to trade block',
        error instanceof Error ? error : new Error(String(error)),
      );
      setMutationError(
        'Failed to add player to trade block. Please try again.',
      );
    }
  };

  const handleCancelAdd = () => {
    setAddExpanded(false);
    setSelectedAddId(null);
    setAddPriceInput('');
  };

  const players = data?.leagueTradeBlock ?? [];
  const displayList = expanded ? players : players.slice(0, 5);
  const hasMore = players.length > 5;

  const selectedAddMember =
    rosterAvailableToAdd.find((member) => member.id === selectedAddId) ?? null;
  const selectedAddPlayerName = selectedAddMember
    ? formatPlayerName(selectedAddMember)
    : '';

  const errorBanner = mutationError ? (
    <Text
      color="$red10"
      fontSize="$2"
      marginBottom="$2"
      testID="trade-block-mutation-error"
      role="alert"
    >
      {mutationError}
    </Text>
  ) : null;

  const addSection =
    userTeamId != null ? (
      <YStack marginBottom="$3" gap="$2">
        <Button
          size="$2"
          alignSelf="flex-start"
          backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.15)}
          borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.4)}
          borderWidth={1}
          borderRadius="$2"
          paddingHorizontal="$2"
          icon={<Plus size={14} color={BRAND_GOLD_LIGHT} />}
          onPress={() => {
            if (addExpanded) {
              handleCancelAdd();
            } else {
              setAddExpanded(true);
            }
          }}
          aria-expanded={addExpanded}
          testID="add-player-toggle"
        >
          <Text fontSize="$1" fontWeight="600" color={BRAND_GOLD_LIGHT}>
            {addExpanded ? 'Cancel' : 'Add Player'}
          </Text>
        </Button>

        {addExpanded && (
          <YStack
            backgroundColor="$surfaceSubtle"
            borderRadius="$4"
            padding="$3"
            gap="$2"
            testID="add-player-section"
          >
            {rosterLoading ? (
              <XStack
                alignItems="center"
                justifyContent="center"
                paddingVertical="$2"
              >
                <Spinner size="small" color={BRAND_GOLD_LIGHT} />
              </XStack>
            ) : rosterError ? (
              <Text color="$red10" fontSize="$2" textAlign="center">
                Failed to load your roster. Please try again.
              </Text>
            ) : rosterAvailableToAdd.length === 0 ? (
              <Text color="$textMuted" fontSize="$2" textAlign="center">
                All your rostered players are already on the trade block.
              </Text>
            ) : selectedAddId == null ? (
              <YStack gap="$1">
                {rosterAvailableToAdd.map((member) => {
                  const playerName = formatPlayerName(member);
                  return (
                    <Button
                      key={member.id}
                      size="$2"
                      justifyContent="flex-start"
                      backgroundColor="transparent"
                      borderColor="$outlineSubtle"
                      borderWidth={1}
                      borderRadius="$2"
                      onPress={() => {
                        if (member.id != null) setSelectedAddId(member.id);
                      }}
                      testID={`add-player-option-${member.id}`}
                    >
                      <Text fontSize="$2" color="$color">
                        {playerName}
                      </Text>
                    </Button>
                  );
                })}
              </YStack>
            ) : (
              <YStack gap="$2">
                <Text fontSize="$2" color="$color">
                  Adding: {selectedAddPlayerName}
                </Text>
                <Input
                  size="$2"
                  placeholder="Asking price (optional)"
                  value={addPriceInput}
                  onChangeText={setAddPriceInput}
                  borderColor="$outlineSubtle"
                  testID="add-player-price-input"
                />
                <XStack gap="$2">
                  <Button
                    size="$2"
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                    borderWidth={1}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    disabled={mutating}
                    onPress={() => {
                      void handleAddToBlock();
                    }}
                    testID="confirm-add-button"
                  >
                    <Text
                      fontSize="$1"
                      fontWeight="600"
                      color={BRAND_GOLD_LIGHT}
                    >
                      Confirm Add
                    </Text>
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor="transparent"
                    borderColor="$outlineSubtle"
                    borderWidth={1}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    disabled={mutating}
                    onPress={() => setSelectedAddId(null)}
                    testID="back-to-picker-button"
                  >
                    <Text fontSize="$1" fontWeight="600" color="$textMuted">
                      Back
                    </Text>
                  </Button>
                </XStack>
              </YStack>
            )}
          </YStack>
        )}
      </YStack>
    ) : null;

  const header = (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      marginBottom="$3"
    >
      <XStack alignItems="center" gap="$2">
        <ArrowLeftRight size={18} color="$color" />
        <Text fontSize="$5" fontWeight="700" color="$color">
          Trade Block
        </Text>
      </XStack>
      {players.length > 0 && (
        <XStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
          borderWidth={1}
          borderRadius="$10"
          paddingHorizontal="$2"
          paddingVertical="$1"
        >
          <Text fontSize="$1" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            {players.length} available
          </Text>
        </XStack>
      )}
    </XStack>
  );

  if (loading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        {addSection}
        {errorBanner}
        <YStack alignItems="center" paddingVertical="$4">
          <Spinner size="small" color={BRAND_GOLD_LIGHT} />
        </YStack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        {addSection}
        {errorBanner}
        <Text
          color="$red10"
          fontSize="$3"
          textAlign="center"
          paddingVertical="$3"
        >
          Failed to load trade block.
        </Text>
      </Card>
    );
  }

  if (players.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        {addSection}
        {errorBanner}
        <YStack alignItems="center" gap="$2" paddingVertical="$5">
          <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor="$surfaceSubtle"
            alignItems="center"
            justifyContent="center"
            marginBottom="$1"
          >
            <ArrowLeftRight size={20} color="$textMuted" />
          </YStack>
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            No players on the trade block
          </Text>
          <Text
            color="$textMuted"
            fontSize="$2"
            textAlign="center"
            maxWidth={260}
          >
            Use the roster page to list players for trade.
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      padding="$5"
    >
      {header}
      {addSection}
      {errorBanner}

      <YStack gap="$1">
        {displayList.map((member, idx) => {
          const memberId = member.id;
          const isOwnTeam = userTeamId != null && member.teamId === userTeamId;
          const playerName = formatPlayerName(member);
          const initial = playerName[0] ?? '?';

          return (
            <React.Fragment key={memberId ?? idx}>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingVertical="$2"
                paddingHorizontal="$2"
                borderRadius="$3"
                hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
              >
                <XStack alignItems="center" gap="$2" flex={1}>
                  <YStack
                    width={28}
                    height={28}
                    borderRadius={14}
                    backgroundColor="$surfaceSubtle"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text fontSize="$2" fontWeight="700" color="$textMuted">
                      {initial}
                    </Text>
                  </YStack>
                  <YStack flex={1}>
                    <Text
                      fontSize="$3"
                      color="$color"
                      fontWeight="500"
                      numberOfLines={1}
                    >
                      {playerName}
                    </Text>
                    {member.askingPrice ? (
                      <XStack alignItems="center" gap="$1" marginTop="$0.5">
                        <DollarSign size={10} color="$textMuted" />
                        <Text
                          fontSize="$1"
                          color="$textMuted"
                          numberOfLines={1}
                          testID={`asking-price-${memberId}`}
                        >
                          Asking: {member.askingPrice}
                        </Text>
                      </XStack>
                    ) : null}
                  </YStack>
                </XStack>

                {isOwnTeam && memberId != null ? (
                  <XStack alignItems="center" gap="$2">
                    {editingPriceId === memberId ? (
                      <XStack alignItems="center" gap="$1">
                        <Input
                          size="$2"
                          width={120}
                          placeholder="Asking price"
                          value={priceInput}
                          onChangeText={setPriceInput}
                          borderColor="$outlineSubtle"
                          testID="asking-price-input"
                        />
                        <Button
                          size="$2"
                          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                          borderWidth={1}
                          borderRadius="$2"
                          paddingHorizontal="$2"
                          disabled={mutating}
                          onPress={() => {
                            void handleSavePrice(memberId);
                          }}
                          testID="save-price-button"
                        >
                          <Text
                            fontSize="$1"
                            fontWeight="600"
                            color={BRAND_GOLD_LIGHT}
                          >
                            Save
                          </Text>
                        </Button>
                      </XStack>
                    ) : (
                      <Button
                        size="$2"
                        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
                        borderWidth={1}
                        borderRadius="$2"
                        paddingHorizontal="$2"
                        disabled={mutating}
                        onPress={() => {
                          setEditingPriceId(memberId);
                          setPriceInput(member.askingPrice ?? '');
                        }}
                        testID="set-price-button"
                      >
                        <Text
                          fontSize="$1"
                          fontWeight="600"
                          color={BRAND_GOLD_LIGHT}
                        >
                          {member.askingPrice ? 'Edit Price' : 'Set Price'}
                        </Text>
                      </Button>
                    )}
                    <Button
                      size="$2"
                      backgroundColor="$red3"
                      borderColor="$red7"
                      borderWidth={1}
                      borderRadius="$2"
                      paddingHorizontal="$2"
                      disabled={mutating}
                      onPress={() => {
                        void handleRemove(memberId);
                      }}
                    >
                      <Text fontSize="$1" fontWeight="600" color="$red11">
                        Remove
                      </Text>
                    </Button>
                  </XStack>
                ) : (
                  <XStack alignItems="center" gap="$2">
                    <XStack
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                      borderWidth={1}
                      borderRadius="$2"
                      paddingHorizontal="$2"
                      paddingVertical="$0.5"
                    >
                      <Text
                        fontSize="$1"
                        fontWeight="600"
                        color={BRAND_GOLD_LIGHT}
                      >
                        AVAILABLE
                      </Text>
                    </XStack>
                  </XStack>
                )}
              </XStack>
              {idx < displayList.length - 1 && (
                <Separator borderColor="$outlineSubtle" />
              )}
            </React.Fragment>
          );
        })}
      </YStack>

      {hasMore && (
        <Button
          size="$3"
          backgroundColor="transparent"
          borderWidth={0}
          onPress={() => setExpanded(!expanded)}
          marginTop="$2"
          alignSelf="center"
          icon={
            expanded ? (
              <ChevronUp size={14} color={BRAND_GOLD_LIGHT} />
            ) : (
              <ChevronDown size={14} color={BRAND_GOLD_LIGHT} />
            )
          }
        >
          <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
            {expanded ? 'Show fewer' : `Show ${players.length - 5} more`}
          </Text>
        </Button>
      )}
    </Card>
  );
}
