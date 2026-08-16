import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Minus } from '@tamagui/lucide-icons/icons/Minus';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import type { DefensiveFormat } from './StepDefensiveFormat';

export const DST_ROSTER_DEFAULTS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DST: 1,
  BN: 6,
};

export const IDP_ROSTER_DEFAULTS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DL: 2,
  LB: 2,
  DB: 2,
  BN: 6,
};

const SLOT_LABELS: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  FLEX: 'Flex (RB/WR/TE)',
  K: 'Kicker',
  DST: 'Team D/ST',
  DL: 'Defensive Line',
  LB: 'Linebacker',
  DB: 'Defensive Back',
  BN: 'Bench',
};

// Matches the server's football roster-size floor (`ROSTER_RANGE_BY_SPORT.football.min`
// in lambdas/db/src/schema/leagues/sport-validation.ts) so the wizard can never submit
// a total the server will reject.
const MIN_ROSTER_SIZE = 10;

interface StepRosterSettingsProps {
  defensiveFormat: DefensiveFormat;
  rosterSlots: Record<string, number>;
  onChange: (rosterSlots: Record<string, number>) => void;
}

function SlotRow({
  slot,
  count,
  canDecrement,
  onIncrement,
  onDecrement,
}: {
  slot: string;
  count: number;
  canDecrement: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <XStack
      testID={`roster-slot-${slot}`}
      alignItems="center"
      justifyContent="space-between"
      padding="$3"
      backgroundColor="$surfaceCard"
      borderRadius="$2"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
    >
      <YStack flex={1}>
        <Text fontSize={13} fontWeight="600" color="$color">
          {slot}
        </Text>
        <Text fontSize={11} color="$textMuted">
          {SLOT_LABELS[slot] ?? slot}
        </Text>
      </YStack>
      <XStack alignItems="center" gap="$3">
        <XStack
          testID={`roster-slot-${slot}-decrement`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${slot}`}
          aria-label={`Decrease ${slot}`}
          tabIndex={canDecrement ? 0 : -1}
          onKeyDown={
            canDecrement
              ? (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onDecrement();
                  }
                }
              : undefined
          }
          pressStyle={{ opacity: 0.7 }}
          onPress={canDecrement ? onDecrement : undefined}
          width={28}
          height={28}
          borderRadius="$full"
          backgroundColor={
            canDecrement ? '$brandNavyLight' : '$surfacePanelBorder'
          }
          alignItems="center"
          justifyContent="center"
          cursor={canDecrement ? 'pointer' : 'default'}
        >
          <Minus
            size={12}
            color={canDecrement ? '$textOnAccent' : '$textMuted'}
          />
        </XStack>
        <Text
          testID={`roster-slot-${slot}-count`}
          fontSize={16}
          fontWeight="700"
          color="$brandGold"
          minWidth={20}
          textAlign="center"
        >
          {count}
        </Text>
        <XStack
          testID={`roster-slot-${slot}-increment`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${slot}`}
          aria-label={`Increase ${slot}`}
          tabIndex={0}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onIncrement();
            }
          }}
          pressStyle={{ opacity: 0.7 }}
          onPress={onIncrement}
          width={28}
          height={28}
          borderRadius="$full"
          backgroundColor="$brandNavyLight"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
        >
          <Plus size={12} color="$textOnAccent" />
        </XStack>
      </XStack>
    </XStack>
  );
}

export function StepRosterSettings({
  defensiveFormat,
  rosterSlots,
  onChange,
}: StepRosterSettingsProps) {
  const slotOrder =
    defensiveFormat === 'idp'
      ? ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DL', 'LB', 'DB', 'BN']
      : ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BN'];

  const totalStarters = Object.entries(rosterSlots)
    .filter(([slot]) => slot !== 'BN')
    .reduce((sum, [, n]) => sum + n, 0);
  const bench = rosterSlots['BN'] ?? 0;
  const totalRoster = totalStarters + bench;

  function adjust(slot: string, delta: number) {
    const current = rosterSlots[slot] ?? 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    if (delta < 0 && totalRoster <= MIN_ROSTER_SIZE) return;
    onChange({ ...rosterSlots, [slot]: next });
  }

  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          Roster Settings
        </Text>
        <Text fontSize={14} color="$textMuted">
          Configure starting lineup slots and bench size. Defaults reflect a{' '}
          {defensiveFormat === 'idp' ? 'IDP' : 'D/ST'} format.
        </Text>
      </YStack>

      <YStack
        testID="roster-positions-totals"
        padding="$3"
        backgroundColor="$surfaceInteractive"
        borderRadius="$2"
        borderWidth={1}
        borderColor="$outlineSubtle"
      >
        <XStack gap="$4">
          <YStack alignItems="center">
            <Text
              testID="roster-positions-totals-starters"
              fontSize={20}
              fontWeight="700"
              color="$brandGold"
            >
              {totalStarters}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Starters
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text
              testID="roster-positions-totals-bench"
              fontSize={20}
              fontWeight="700"
              color="$color"
            >
              {bench}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Bench
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text
              testID="roster-positions-totals-total"
              fontSize={20}
              fontWeight="700"
              color="$color"
            >
              {totalRoster}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Total
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <YStack gap="$2">
        {slotOrder.map((slot) => (
          <SlotRow
            key={slot}
            slot={slot}
            count={rosterSlots[slot] ?? 0}
            canDecrement={
              (rosterSlots[slot] ?? 0) > 0 && totalRoster > MIN_ROSTER_SIZE
            }
            onIncrement={() => adjust(slot, 1)}
            onDecrement={() => adjust(slot, -1)}
          />
        ))}
      </YStack>
    </YStack>
  );
}
