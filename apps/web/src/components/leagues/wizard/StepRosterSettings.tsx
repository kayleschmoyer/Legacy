import React from 'react';
import { Text, YStack } from 'tamagui';
import { RosterPositionsEditor } from '@legacy-sports/shared-components/leagues';
import type { DefensiveFormat } from './StepDefensiveFormat';

// Kept here (rather than importing the shared FOOTBALL_ROSTER_SLOT_DEFAULTS_BY_DEFENSIVE_FORMAT)
// since the two differ slightly (this form's D/ST default carries BN: 6, not 7) and
// changing that default is explicitly out of scope for LS-9109/LS-6151.
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

// Matches the server's football roster-size floor (`ROSTER_RANGE_BY_SPORT.football.min`
// in lambdas/db/src/schema/leagues/sport-validation.ts) so the form can never submit
// a total the server will reject (LS-6149).
const MIN_ROSTER_SIZE = 10;

function sumSlots(slots: Record<string, number>): number {
  return Object.values(slots).reduce((sum, n) => sum + n, 0);
}

interface StepRosterSettingsProps {
  defensiveFormat: DefensiveFormat;
  rosterSlots: Record<string, number>;
  onChange: (rosterSlots: Record<string, number>) => void;
  /** Whether the viewer can add Superflex / Kicker-Punter slots (LS-9107 entitlement). */
  isPremium: boolean;
  /** Called when a non-premium viewer interacts with a gated slot. */
  onUpgrade: () => void;
  disabled?: boolean;
  error?: string;
}

export function StepRosterSettings({
  defensiveFormat,
  rosterSlots,
  onChange,
  isPremium,
  onUpgrade,
  disabled = false,
  error,
}: StepRosterSettingsProps) {
  const currentTotal = sumSlots(rosterSlots);

  function handleChange(next: Record<string, number>) {
    // Once at the server floor, block any further decrement across every
    // slot (base or premium) rather than letting the total dip below it.
    if (currentTotal <= MIN_ROSTER_SIZE && sumSlots(next) < currentTotal) {
      return;
    }
    onChange(next);
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

      <RosterPositionsEditor
        rosterSlots={rosterSlots}
        defensiveFormat={defensiveFormat}
        onChange={handleChange}
        isPremium={isPremium}
        onUpgrade={onUpgrade}
        disabled={disabled}
        error={error}
      />
    </YStack>
  );
}
