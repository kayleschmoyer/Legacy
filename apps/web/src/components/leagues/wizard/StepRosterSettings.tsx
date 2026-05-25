import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Minus, Plus } from '@tamagui/lucide-icons';
import type { DefensiveFormat } from './StepDefensiveFormat';
import {
  BRAND_GOLD,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../../constants/colors';

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
  DP: 1,
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
  DP: 'IDP Flex',
  BN: 'Bench',
};

interface StepRosterSettingsProps {
  defensiveFormat: DefensiveFormat;
  rosterSlots: Record<string, number>;
  onChange: (rosterSlots: Record<string, number>) => void;
}

function SlotRow({
  slot,
  count,
  onIncrement,
  onDecrement,
}: {
  slot: string;
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      padding="$3"
      backgroundColor={SURFACE_CARD}
      borderRadius="$2"
      borderWidth={1}
      borderColor={PANEL_BORDER}
    >
      <YStack flex={1}>
        <Text fontSize={13} fontWeight="600" color={TEXT_PRIMARY}>
          {slot}
        </Text>
        <Text fontSize={11} color={TEXT_MUTED}>
          {SLOT_LABELS[slot] ?? slot}
        </Text>
      </YStack>
      <XStack alignItems="center" gap="$3">
        <XStack
          pressStyle={{ opacity: 0.7 }}
          onPress={count > 0 ? onDecrement : undefined}
          width={28}
          height={28}
          borderRadius="$full"
          backgroundColor={count > 0 ? '$blue9' : PANEL_BORDER}
          alignItems="center"
          justifyContent="center"
          cursor={count > 0 ? 'pointer' : 'default'}
          animation="quick"
        >
          <Minus size={12} color={count > 0 ? 'white' : TEXT_MUTED} />
        </XStack>
        <Text
          fontSize={16}
          fontWeight="700"
          color={BRAND_GOLD}
          minWidth={20}
          textAlign="center"
        >
          {count}
        </Text>
        <XStack
          pressStyle={{ opacity: 0.7 }}
          onPress={onIncrement}
          width={28}
          height={28}
          borderRadius="$full"
          backgroundColor="$blue9"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          animation="quick"
        >
          <Plus size={12} color="white" />
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
      ? ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DL', 'LB', 'DB', 'DP', 'BN']
      : ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BN'];

  function adjust(slot: string, delta: number) {
    const current = rosterSlots[slot] ?? 0;
    const next = Math.max(0, current + delta);
    onChange({ ...rosterSlots, [slot]: next });
  }

  const totalStarters = Object.entries(rosterSlots)
    .filter(([slot]) => slot !== 'BN')
    .reduce((sum, [, n]) => sum + n, 0);
  const bench = rosterSlots['BN'] ?? 0;
  const totalRoster = totalStarters + bench;

  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color={TEXT_PRIMARY}
        >
          Roster Settings
        </Text>
        <Text fontSize={14} color={TEXT_MUTED}>
          Configure starting lineup slots and bench size. Defaults reflect a{' '}
          {defensiveFormat === 'idp' ? 'IDP' : 'D/ST'} format.
        </Text>
      </YStack>

      <YStack
        padding="$3"
        backgroundColor="$blue2"
        borderRadius="$2"
        borderWidth={1}
        borderColor="$blue6"
      >
        <XStack gap="$4">
          <YStack alignItems="center">
            <Text fontSize={20} fontWeight="700" color={BRAND_GOLD}>
              {totalStarters}
            </Text>
            <Text fontSize={11} color={TEXT_MUTED}>
              Starters
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text fontSize={20} fontWeight="700" color={TEXT_PRIMARY}>
              {bench}
            </Text>
            <Text fontSize={11} color={TEXT_MUTED}>
              Bench
            </Text>
          </YStack>
          <YStack alignItems="center">
            <Text fontSize={20} fontWeight="700" color={TEXT_PRIMARY}>
              {totalRoster}
            </Text>
            <Text fontSize={11} color={TEXT_MUTED}>
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
            onIncrement={() => adjust(slot, 1)}
            onDecrement={() => adjust(slot, -1)}
          />
        ))}
      </YStack>
    </YStack>
  );
}
