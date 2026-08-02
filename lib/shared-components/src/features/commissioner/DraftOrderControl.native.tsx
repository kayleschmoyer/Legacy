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
import {
  ChevronDown,
  ChevronUp,
  List,
  Lock,
  Shuffle,
} from '@tamagui/lucide-icons';
import { type DraftOrderControlProps, useDraftOrder } from './useDraftOrder';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';
import { PremiumGate } from '../../components/PremiumGate';

export type { DraftOrderControlProps };

/**
 * DraftOrderControl (native) — Commissioner control for setting or
 * randomizing the draft pick order on mobile.
 *
 * Tamagui-only: no @dnd-kit (DOM-only, breaks Metro/React Native) and no
 * raw HTML host elements. Reorders via up/down buttons instead of
 * drag-and-drop. Shares query/mutation logic with the web variant
 * (DraftOrderControl.tsx) via useDraftOrder. See LS-8850.
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
                    : 'Use the arrows to reorder, or randomize the pick order.'}
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
          ) : (
            // Ordered list — read-only when locked, up/down reorder otherwise
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
                    hasCustomOrder && !isOrderLocked
                      ? withAlpha(BRAND_NAVY_LIGHT, 0.08)
                      : '$gray2'
                  }
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
                  {!isOrderLocked && (
                    <XStack gap="$1">
                      <Button
                        size="$2"
                        circular
                        chromeless
                        icon={<ChevronUp size={16} />}
                        disabled={index === 0 || isBusy}
                        opacity={index === 0 ? 0.3 : 1}
                        onPress={() => moveTeam(index, index - 1)}
                        aria-label={`Move ${team.teamName} up`}
                      />
                      <Button
                        size="$2"
                        circular
                        chromeless
                        icon={<ChevronDown size={16} />}
                        disabled={index === localOrder.length - 1 || isBusy}
                        opacity={index === localOrder.length - 1 ? 0.3 : 1}
                        onPress={() => moveTeam(index, index + 1)}
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
              )}
            </YStack>
          )}
        </YStack>
      </Card>
    </PremiumGate>
  );
}
