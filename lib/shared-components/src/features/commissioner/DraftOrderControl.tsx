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
import { GripVertical, List, Lock, Shuffle } from '@tamagui/lucide-icons';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';
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

function SortableTeamRow({
  team,
  index,
  isBusy,
  hasCustomOrder,
}: {
  team: DraftTeam;
  index: number;
  isBusy: boolean;
  hasCustomOrder: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.teamId, disabled: isBusy });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <XStack
        alignItems="center"
        gap="$3"
        paddingVertical="$2"
        paddingHorizontal="$3"
        borderRadius="$3"
        backgroundColor={
          hasCustomOrder ? withAlpha(BRAND_NAVY_LIGHT, 0.08) : '$gray2'
        }
      >
        {/* Drag handle */}
        <XStack
          {...attributes}
          {...listeners}
          role="button"
          cursor="grab"
          padding="$1"
          opacity={isBusy ? 0.3 : 0.5}
          hoverStyle={{ opacity: 1 }}
          aria-label={`Drag to reorder ${team.teamName}`}
        >
          <GripVertical size={16} color="$gray10" />
        </XStack>

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
      </XStack>
    </div>
  );
}

/**
 * DraftOrderControl — Commissioner control for setting or randomizing the
 * draft pick order.
 *
 * Editable only before the draft starts (not-started / queued). Once the
 * draft is in-progress the order is locked. Supports drag-and-drop
 * reordering via @dnd-kit/sortable.
 */
export function DraftOrderControl({
  leagueId,
  draftStatus,
  onSuccess,
  onError,
}: DraftOrderControlProps) {
  // Fetch the draft to get draftId (skip only when completed — not needed post-season)
  const { data: draftData } = useGetLeagueDraftQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
    skip: draftStatus === 'completed',
  });

  const draftId = draftData?.getLeagueDraft?.id ?? null;

  // Order is only editable before the draft starts (not-started or queued).
  // Once in-progress, picks may begin at any time — the order is locked.
  const isOrderLocked =
    draftStatus !== 'not-started' && draftStatus !== 'queued';

  // Fetch current draft team order (whenever we have a draftId)
  const { data, loading, refetch } = useGetDraftTeamOrderQuery({
    variables: { draftId: draftId ?? 0 },
    fetchPolicy: 'cache-and-network',
    skip: !draftId,
  });

  const [setDraftOrder, { loading: settingOrder }] = useSetDraftOrderMutation();
  const [randomizeDraftOrder, { loading: randomizing }] =
    useRandomizeDraftOrderMutation();

  // Local ordered list for drag-to-reorder
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder((prev) => {
      const oldIndex = prev.findIndex((t) => t.teamId === active.id);
      const newIndex = prev.findIndex((t) => t.teamId === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
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

  // Post-draft: season is active, order is permanently locked
  if (draftStatus === 'completed') {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <XStack alignItems="center" gap="$2">
          <Lock size={20} color="$gray9" />
          <YStack>
            <H4 margin={0}>Draft Pick Order</H4>
            <Text fontSize="$2" color="$gray10">
              The draft is complete — pick order is permanently locked.
            </Text>
          </YStack>
        </XStack>
      </Card>
    );
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
              <Lock size={20} color="$gray10" />
            ) : (
              <List size={20} color={BRAND_NAVY_LIGHT} />
            )}
            <YStack>
              <H4 margin={0}>Draft Pick Order</H4>
              <Text fontSize="$2" color="$gray10">
                {isOrderLocked
                  ? 'Pick order is locked — the draft is underway.'
                  : 'Drag to reorder, or randomize the pick order.'}
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

        {/* Locked banner — shown when the draft is in-progress */}
        {isOrderLocked && draftStatus === 'in-progress' && (
          <Card
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            padding="$3"
            borderRadius="$4"
          >
            <XStack alignItems="center" gap="$2">
              <Lock size={16} color="$yellow11" />
              <Text fontSize="$3" color="$yellow11" fontWeight="600">
                The draft is underway — pick order can no longer be changed.
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
              {isOrderLocked
                ? 'No draft order recorded.'
                : 'No teams yet. Add teams to the league to configure draft order.'}
            </Text>
          </YStack>
        ) : isOrderLocked ? (
          // Read-only list when locked
          <YStack gap="$2">
            {localOrder.map((team, index) => (
              <XStack
                key={team.teamId}
                alignItems="center"
                gap="$3"
                paddingVertical="$2"
                paddingHorizontal="$3"
                borderRadius="$3"
                backgroundColor="$gray2"
              >
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
                <Text flex={1} fontSize="$3" fontWeight="500" color="$color">
                  {team.teamName}
                </Text>
              </XStack>
            ))}
          </YStack>
        ) : (
          // Sortable list with drag handles
          <YStack gap="$2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localOrder.map((t) => t.teamId)}
                strategy={verticalListSortingStrategy}
              >
                {localOrder.map((team, index) => (
                  <SortableTeamRow
                    key={team.teamId}
                    team={team}
                    index={index}
                    isBusy={isBusy}
                    hasCustomOrder={hasCustomOrder}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Save / Reset row */}
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
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
