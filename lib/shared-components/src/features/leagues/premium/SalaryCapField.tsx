// SalaryCapField — enable toggle + cap-amount input for league creation
// (LS-5174). A premium control: callers wrap it in their platform's PremiumGate.
// Enabling the cap while not premium routes to `onUpgrade`. Shared by web/mobile.

import React from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import { LeagueFieldRow, PillToggle } from './_controls';

export interface SalaryCapFieldProps {
  enabled: boolean;
  amount?: number;
  onToggleEnabled: (v: boolean) => void;
  onAmountChange: (v: number | undefined) => void;
  /** Whether the viewer can enable the salary cap. */
  isPremium: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to enable the cap. */
  onUpgrade: () => void;
  /** Validation message for the cap amount, if any. */
  error?: string;
}

export function SalaryCapField({
  enabled,
  amount,
  onToggleEnabled,
  onAmountChange,
  isPremium,
  disabled = false,
  onUpgrade,
  error,
}: SalaryCapFieldProps): React.JSX.Element {
  return (
    <YStack gap="$3">
      <LeagueFieldRow
        label="Enable Salary Cap"
        hint="Track player salaries and enforce roster spending limits"
      >
        <PillToggle
          testID="create-league-salary-cap-toggle"
          value={enabled}
          offLabel="Off"
          onLabel="On"
          onChange={(v) => {
            if (v && !isPremium) {
              onUpgrade();
              return;
            }
            onToggleEnabled(v);
          }}
          disabled={disabled}
        />
      </LeagueFieldRow>

      {enabled && (
        <LeagueFieldRow
          label="Salary Cap Limit"
          hint="Maximum total salary each team can spend"
        >
          <XStack alignItems="center" gap="$3">
            <Input
              size="$3"
              testID="create-league-salary-cap-input"
              value={amount !== undefined ? String(amount) : ''}
              onChangeText={(text: string) => {
                const n = parseInt(text, 10);
                onAmountChange(isNaN(n) ? undefined : n);
              }}
              placeholder="e.g. 50000000"
              keyboardType="numeric"
              disabled={disabled}
              borderColor={error ? '$red8' : '$borderColor'}
            />
            {error && (
              <Text fontFamily="$body" fontSize={12} color="$red10">
                {error}
              </Text>
            )}
          </XStack>
        </LeagueFieldRow>
      )}
    </YStack>
  );
}
