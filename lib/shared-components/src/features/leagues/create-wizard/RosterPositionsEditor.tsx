// RosterPositionsEditor — shared per-position roster slot editor for football
// league creation (LS-9108). Consolidates the roster-slot UI previously
// duplicated across `apps/web`'s `StepRosterSettings.tsx` and the inline
// `FootballRosterSlotsField` in `LeagueCreateWizard.tsx`, and adds two new
// premium-gated slot types: Superflex (`SFLEX`) and Kicker/Punter (`KP`).
//
// The base slot set (`FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT`) stays fully
// interactive regardless of premium status — only the two new slot types are
// gated, mirroring the `PremiumGate` pattern in `premium/_controls.tsx` and
// `premium/SalaryCapField.tsx`: a non-premium viewer still sees the SFLEX/K-P
// rows, but interacting with them calls `onUpgrade` instead of silently doing
// nothing (LS-6114's no-silent-no-op rule).
//
// Wiring this into apps/web (LS-9109) / apps/app (LS-9110) is out of scope
// here. The real `custom_roster_positions` entitlement key from LS-9107 is
// resolved by the caller and passed in as `isPremium` — this component never
// references an entitlement key directly.

import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Lock, Minus, Plus } from '@tamagui/lucide-icons';
import { WIZARD_TAP_TARGET, WizardFieldRow } from './chrome';
import {
  type DefensiveFormatChoice,
  FOOTBALL_ROSTER_SLOT_LABELS,
  FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT,
  PREMIUM_FOOTBALL_ROSTER_SLOTS,
  sumRosterSlots,
} from './constants';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
} from '../../../utils/colors';

export interface RosterPositionsEditorProps {
  rosterSlots: Record<string, number>;
  defensiveFormat: DefensiveFormatChoice;
  onChange: (rosterSlots: Record<string, number>) => void;
  /** Whether the viewer can add Superflex / Kicker-Punter slots. */
  isPremium: boolean;
  /** Called when a non-premium viewer interacts with a gated slot, instead of a silent no-op. */
  onUpgrade: () => void;
  disabled?: boolean;
  error?: string;
}

export function RosterPositionsEditor({
  rosterSlots,
  defensiveFormat,
  onChange,
  isPremium,
  onUpgrade,
  disabled = false,
  error,
}: RosterPositionsEditorProps): React.JSX.Element {
  const baseSlotOrder =
    FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT[defensiveFormat];
  const totalStarters = Object.keys(rosterSlots)
    .filter((slot) => slot !== 'BN')
    .reduce((sum, slot) => sum + (rosterSlots[slot] ?? 0), 0);
  const bench = rosterSlots.BN ?? 0;
  const total = sumRosterSlots(rosterSlots);

  function adjustBase(slot: string, delta: number) {
    const next = Math.max(0, (rosterSlots[slot] ?? 0) + delta);
    onChange({ ...rosterSlots, [slot]: next });
  }

  function adjustPremium(slot: string, delta: number) {
    if (!isPremium) {
      onUpgrade();
      return;
    }
    const next = Math.max(0, (rosterSlots[slot] ?? 0) + delta);
    onChange({ ...rosterSlots, [slot]: next });
  }

  return (
    <WizardFieldRow
      label="Roster Positions"
      testID="roster-positions-editor"
      hint="Number of players at each position. Roster size is the total."
      error={error}
    >
      <YStack gap={12}>
        <XStack
          testID="roster-positions-totals"
          justifyContent="space-between"
          paddingHorizontal={4}
        >
          <Text fontFamily="$body" fontSize={12} color={TEXT_TERTIARY}>
            Starters: {totalStarters}
          </Text>
          <Text fontFamily="$body" fontSize={12} color={TEXT_TERTIARY}>
            Bench: {bench}
          </Text>
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={12}
            color={BRAND_GOLD}
          >
            Total: {total}
          </Text>
        </XStack>

        <YStack gap={8}>
          {baseSlotOrder.map((slot) => (
            <RosterSlotRow
              key={slot}
              testID={`roster-slot-${slot}`}
              slot={slot}
              count={rosterSlots[slot] ?? 0}
              disabled={disabled}
              locked={false}
              onIncrement={() => adjustBase(slot, 1)}
              onDecrement={() => adjustBase(slot, -1)}
            />
          ))}
        </YStack>

        <YStack gap={8}>
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.2}
            textTransform="uppercase"
            color={TEXT_TERTIARY}
          >
            Premium Positions
          </Text>
          {PREMIUM_FOOTBALL_ROSTER_SLOTS.map((slot) => (
            <RosterSlotRow
              key={slot}
              testID={`roster-premium-slot-${slot}`}
              slot={slot}
              count={rosterSlots[slot] ?? 0}
              disabled={disabled}
              locked={!isPremium}
              onIncrement={() => adjustPremium(slot, 1)}
              onDecrement={() => adjustPremium(slot, -1)}
            />
          ))}
        </YStack>
      </YStack>
    </WizardFieldRow>
  );
}

interface RosterSlotRowProps {
  testID: string;
  slot: string;
  count: number;
  disabled: boolean;
  /** Premium-gated and not currently unlocked. */
  locked: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}

function RosterSlotRow({
  testID,
  slot,
  count,
  disabled,
  locked,
  onIncrement,
  onDecrement,
}: RosterSlotRowProps): React.JSX.Element {
  // A locked row still calls onIncrement — the caller routes that to
  // onUpgrade — so interaction is never a silent no-op (LS-6114). Decrement
  // stays inert while locked: a gated slot's count never leaves zero, so
  // there is nothing to decrement.
  const canDecrement = !disabled && !locked && count > 0;
  const canIncrement = !disabled;

  return (
    <XStack
      testID={testID}
      alignItems="center"
      justifyContent="space-between"
      padding={12}
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderStyle={locked ? 'dashed' : 'solid'}
      borderColor={locked ? BRAND_GOLD : PANEL_BORDER}
      borderRadius={10}
      opacity={disabled ? 0.5 : 1}
    >
      <XStack flex={1} alignItems="center" gap={8}>
        {locked && <Lock size={12} color={BRAND_GOLD} />}
        <YStack flex={1}>
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={13}
            color={TEXT_PRIMARY}
          >
            {slot}
          </Text>
          <Text fontFamily="$body" fontSize={11} color={TEXT_TERTIARY}>
            {FOOTBALL_ROSTER_SLOT_LABELS[slot] ?? slot}
          </Text>
        </YStack>
      </XStack>
      <XStack alignItems="center" gap={12}>
        <XStack
          testID={`${testID}-decrement`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${slot}`}
          aria-label={`Decrease ${slot}`}
          accessibilityState={{ disabled: !canDecrement }}
          aria-disabled={!canDecrement}
          tabIndex={canDecrement ? 0 : -1}
          onPress={() => canDecrement && onDecrement()}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (canDecrement && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onDecrement();
            }
          }}
          width={WIZARD_TAP_TARGET}
          height={WIZARD_TAP_TARGET}
          borderRadius={WIZARD_TAP_TARGET / 2}
          alignItems="center"
          justifyContent="center"
          backgroundColor={canDecrement ? BRAND_NAVY_LIGHT : PANEL_BORDER}
          cursor={canDecrement ? 'pointer' : 'default'}
          pressStyle={canDecrement ? { opacity: 0.7 } : undefined}
        >
          <Minus size={12} color={canDecrement ? BG_DARK : TEXT_TERTIARY} />
        </XStack>
        <Text
          fontFamily="$body"
          fontWeight="700"
          fontSize={16}
          fontVariant={['tabular-nums']}
          color={BRAND_GOLD}
          minWidth={20}
          textAlign="center"
        >
          {count}
        </Text>
        <XStack
          testID={`${testID}-increment`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${slot}`}
          aria-label={`Increase ${slot}`}
          accessibilityState={{ disabled: !canIncrement }}
          aria-disabled={!canIncrement}
          tabIndex={canIncrement ? 0 : -1}
          onPress={() => canIncrement && onIncrement()}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (canIncrement && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onIncrement();
            }
          }}
          width={WIZARD_TAP_TARGET}
          height={WIZARD_TAP_TARGET}
          borderRadius={WIZARD_TAP_TARGET / 2}
          alignItems="center"
          justifyContent="center"
          backgroundColor={canIncrement ? BRAND_NAVY_LIGHT : PANEL_BORDER}
          cursor={canIncrement ? 'pointer' : 'default'}
          pressStyle={canIncrement ? { opacity: 0.7 } : undefined}
        >
          <Plus size={12} color={canIncrement ? BG_DARK : TEXT_TERTIARY} />
        </XStack>
      </XStack>
    </XStack>
  );
}
