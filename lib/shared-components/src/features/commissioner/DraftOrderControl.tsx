import React from 'react';
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
import { GripVertical } from '@tamagui/lucide-icons/icons/GripVertical';
import { List } from '@tamagui/lucide-icons/icons/List';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import { Shuffle } from '@tamagui/lucide-icons/icons/Shuffle';
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type DraftOrderControlProps,
  type DraftTeam,
  useDraftOrder,
} from './useDraftOrder';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';
import { PremiumGate } from '../../components/PremiumGate';

export type { DraftOrderControlProps };

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
    <YStack ref={setNodeRef} style={style}>
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
    </YStack>
  );
}

/**
 * DraftOrderControl — Commissioner control for setting or randomizing the
 * draft pick order.
 *
 * Editable only before the draft starts (not-started / queued). Once the
 * draft is in-progress the order is locked. Supports drag-and-drop
 * reordering via @dnd-kit/sortable.
 *
 * Web only — see DraftOrderControl.native.tsx for the Tamagui-only native
 * variant (up/down reorder, no @dnd-kit). Both share query/mutation logic
 * via useDraftOrder. See LS-8850.
 */
export function DraftOrderControl({
  leagueId,
  draftStatus,
  isPremium = true,
  onSuccess,
  onError,
}: DraftOrderControlProps) {
  const {
    isOrderLocked,
    loading,
    localOrder,
    hasCustomOrder,
    settingOrder,
    randomizing,
    isBusy,
    moveTeam,
    handleSaveOrder,
    handleRandomize,
    handleReset,
  } = useDraftOrder({ leagueId, draftStatus, onSuccess, onError });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localOrder.findIndex((t) => t.teamId === active.id);
    const newIndex = localOrder.findIndex((t) => t.teamId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    moveTeam(oldIndex, newIndex);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Post-draft: season is active, order is permanently locked
  if (draftStatus === 'completed') {
    return (
      <PremiumGate isPremium={isPremium} featureName="Draft Pick Order">
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
      </PremiumGate>
    );
  }

  return (
    <PremiumGate isPremium={isPremium} featureName="Draft Pick Order">
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
                    <Text
                      fontSize="$2"
                      fontWeight="700"
                      color={BRAND_NAVY_LIGHT}
                    >
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
                  backgroundColor="$brandNavyLight"
                  hoverStyle={{ backgroundColor: '$brandNavy' }}
                  pressStyle={{ backgroundColor: '$brandNavyDark' }}
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
    </PremiumGate>
  );
}
