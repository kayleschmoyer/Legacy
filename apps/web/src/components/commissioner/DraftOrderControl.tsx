import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { ArrowDown, ArrowUp, List, Lock, Shuffle } from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';
import {
  useGetDraftTeamOrderQuery,
  useGetLeagueDraftQuery,
  useRandomizeDraftOrderMutation,
  useSetDraftOrderMutation,
} from '../../api/db/graphql.generated';

export interface DraftOrderControlProps {
  leagueId: number;
  draftStatus: string | null | undefined;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

type DraftTeam = { teamId: number; teamName: string; draftOrder: number };

/**
 * DraftOrderControl — Commissioner control for setting or randomizing the
 * draft pick order.
 *
 * Visible only when the draft is `in-progress` and no picks have been made
 * yet (`currentPick === 0`). Allows the commissioner to:
 *  - Re-randomize the draft order with one click
 *  - Manually reorder teams using up/down controls, then save
 */
export function DraftOrderControl({
  leagueId,
  draftStatus,
  onSuccess,
  onError,
}: DraftOrderControlProps) {
  // Fetch the draft to get draftId + currentPick
  const { data: draftData } = useGetLeagueDraftQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
    skip: draftStatus !== 'in-progress',
  });

  const draftId = draftData?.getLeagueDraft?.id ?? null;
  const currentPick = draftData?.getLeagueDraft?.currentPick ?? 0;

  const isOrderLocked =
    draftStatus !== 'in-progress' || Number(currentPick) !== 0;

  // Fetch current draft team order
  const { data, loading, refetch } = useGetDraftTeamOrderQuery({
    variables: { draftId: draftId ?? 0 },
    fetchPolicy: 'cache-and-network',
    skip: !draftId || draftStatus !== 'in-progress',
  });

  const [setDraftOrder, { loading: settingOrder }] = useSetDraftOrderMutation();
  const [randomizeDraftOrder, { loading: randomizing }] =
    useRandomizeDraftOrderMutation();

  // Local ordered list for manual re-ordering
  const [localOrder, setLocalOrder] = useState<DraftTeam[]>([]);
  const [hasCustomOrder, setHasCustomOrder] = useState(false);

  // Sync local state from server
  useEffect(() => {
    if (data?.getDraftTeamOrder) {
      const sorted = [...data.getDraftTeamOrder]
        .filter(
          (e): e is DraftTeam =>
            e.teamId != null && e.teamName != null && e.draftOrder != null,
        )
        .sort((a, b) => a.draftOrder - b.draftOrder);
      setLocalOrder(sorted);
      setHasCustomOrder(false);
    }
  }, [data]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...localOrder];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
    setLocalOrder(newOrder);
    setHasCustomOrder(true);
  };

  const moveDown = (index: number) => {
    if (index === localOrder.length - 1) return;
    const newOrder = [...localOrder];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
    setLocalOrder(newOrder);
    setHasCustomOrder(true);
  };

  const handleSaveOrder = async () => {
    if (!draftId) return;
    try {
      await setDraftOrder({
        variables: {
          draftId,
          teamIds: localOrder.map((t) => t.teamId),
        },
        refetchQueries: ['GetDraftTeamOrder', 'GetLiveDraftLeagueDraft'],
        awaitRefetchQueries: true,
      });
      setHasCustomOrder(false);
      onSuccess?.('Draft order saved successfully!');
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onError?.(new Error(msg));
    }
  };

  const handleRandomize = async () => {
    if (!draftId) return;
    try {
      await randomizeDraftOrder({
        variables: { draftId },
        refetchQueries: ['GetDraftTeamOrder', 'GetLiveDraftLeagueDraft'],
        awaitRefetchQueries: true,
      });
      setHasCustomOrder(false);
      onSuccess?.('Draft order randomized!');
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onError?.(new Error(msg));
    }
  };

  const handleReset = () => {
    if (data?.getDraftTeamOrder) {
      const sorted = [...data.getDraftTeamOrder]
        .filter(
          (e): e is DraftTeam =>
            e.teamId != null && e.teamName != null && e.draftOrder != null,
        )
        .sort((a, b) => a.draftOrder - b.draftOrder);
      setLocalOrder(sorted);
      setHasCustomOrder(false);
    }
  };

  const isBusy = settingOrder || randomizing;

  // Don't render at all when the draft hasn't been initialized yet
  if (draftStatus !== 'in-progress') {
    return null;
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            {isOrderLocked ? (
              <Lock size={20} color="var(--gray10)" />
            ) : (
              <List size={20} color={BRAND_NAVY_LIGHT} />
            )}
            <YStack>
              <H4 margin={0}>Draft Pick Order</H4>
              <Text fontSize="$2" color="$gray10">
                {isOrderLocked
                  ? 'Pick order is locked — the draft has already begun.'
                  : 'Set or randomize the order in which teams make their picks.'}
              </Text>
            </YStack>
          </XStack>

          {/* Randomize button in header row */}
          {!isOrderLocked && (
            <Button
              size="$3"
              theme="alt2"
              icon={
                randomizing ? <Spinner size="small" /> : <Shuffle size={16} />
              }
              onPress={() => void handleRandomize()}
              disabled={isBusy}
              aria-label="Randomize draft order"
            >
              {randomizing ? 'Shuffling…' : 'Randomize'}
            </Button>
          )}
        </XStack>

        {/* Locked banner */}
        {isOrderLocked && Number(currentPick ?? 0) > 0 && (
          <Card
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            padding="$3"
            borderRadius="$4"
          >
            <XStack alignItems="center" gap="$2">
              <Lock size={16} color="var(--yellow11)" />
              <Text fontSize="$3" color="$yellow11" fontWeight="600">
                The draft order is locked because picks have been made.
              </Text>
            </XStack>
          </Card>
        )}

        <Separator />

        {loading ? (
          <YStack alignItems="center" padding="$4" gap="$2">
            <Spinner size="large" />
            <Text color="$gray10">Loading draft order…</Text>
          </YStack>
        ) : localOrder.length === 0 ? (
          <YStack alignItems="center" padding="$4">
            <Text color="$gray10">
              No draft order found. Initialize the draft first.
            </Text>
          </YStack>
        ) : (
          <YStack gap="$2">
            {localOrder.map((team, index) => (
              <XStack
                key={team.teamId}
                alignItems="center"
                gap="$3"
                paddingVertical="$2"
                paddingHorizontal="$3"
                borderRadius="$3"
                backgroundColor={
                  hasCustomOrder ? withAlpha(BRAND_NAVY_LIGHT, 0.08) : '$gray2'
                }
              >
                {/* Slot number badge */}
                <XStack
                  width={28}
                  height={28}
                  alignItems="center"
                  justifyContent="center"
                  borderRadius="$10"
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                >
                  <Text fontSize="$2" fontWeight="700" color={BRAND_NAVY_LIGHT}>
                    {index + 1}
                  </Text>
                </XStack>

                {/* Team name */}
                <Text flex={1} fontSize="$3" fontWeight="500" color="$color">
                  {team.teamName}
                </Text>

                {/* Up / Down controls */}
                {!isOrderLocked && (
                  <XStack gap="$1">
                    <Button
                      size="$2"
                      theme="alt2"
                      borderRadius="$3"
                      icon={<ArrowUp size={14} />}
                      onPress={() => moveUp(index)}
                      disabled={index === 0 || isBusy}
                      opacity={index === 0 ? 0.3 : 1}
                      aria-label={`Move ${team.teamName} up`}
                    />
                    <Button
                      size="$2"
                      theme="alt2"
                      borderRadius="$3"
                      icon={<ArrowDown size={14} />}
                      onPress={() => moveDown(index)}
                      disabled={index === localOrder.length - 1 || isBusy}
                      opacity={index === localOrder.length - 1 ? 0.3 : 1}
                      aria-label={`Move ${team.teamName} down`}
                    />
                  </XStack>
                )}
              </XStack>
            ))}

            {/* Save / Reset row */}
            {!isOrderLocked && (
              <XStack
                gap="$3"
                justifyContent="flex-end"
                flexWrap="wrap"
                paddingTop="$2"
              >
                <Button
                  theme="alt2"
                  size="$3"
                  onPress={handleReset}
                  disabled={!hasCustomOrder || isBusy}
                  opacity={!hasCustomOrder ? 0.5 : 1}
                >
                  Reset
                </Button>
                <Button
                  theme="blue"
                  size="$3"
                  onPress={() => void handleSaveOrder()}
                  disabled={!hasCustomOrder || isBusy}
                  opacity={!hasCustomOrder ? 0.5 : 1}
                  icon={settingOrder ? <Spinner size="small" /> : undefined}
                >
                  {settingOrder ? 'Saving…' : 'Save Order'}
                </Button>
              </XStack>
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
