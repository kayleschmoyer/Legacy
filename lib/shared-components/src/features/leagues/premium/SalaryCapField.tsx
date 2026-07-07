// SalaryCapField — enable toggle + cap-amount input for league creation
// (LS-5174). A premium control: callers wrap it in their platform's PremiumGate.
// Enabling the cap while not premium routes to `onUpgrade`. Shared by web/mobile.
//
// Advanced fields (salary floor, luxury tax threshold, minimum salary, and the
// year-over-year escalation/decay percentages) mirror the resolver's optional
// `createLeagueAndTeams` args (LS-6119) — a caller only needs to pass the
// value + onChange pair for a field it wants to expose; omitted pairs simply
// don't render, so existing callers (e.g. mobile create) are unaffected.

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

  /** Minimum total salary each team must spend. */
  salaryFloor?: number;
  onSalaryFloorChange?: (v: number | undefined) => void;
  salaryFloorError?: string;

  /** Total salary above which luxury tax applies. */
  luxuryTaxThreshold?: number;
  onLuxuryTaxThresholdChange?: (v: number | undefined) => void;
  luxuryTaxThresholdError?: string;

  /** Lowest salary any single player can be assigned. */
  minSalary?: number;
  onMinSalaryChange?: (v: number | undefined) => void;
  minSalaryError?: string;

  /** Year-over-year raise (%) applied to rostered players' salaries. */
  salaryEscalationPct?: number;
  onSalaryEscalationPctChange?: (v: number | undefined) => void;
  salaryEscalationPctError?: string;

  /** Year-over-year decay (%) applied to non-rostered players' salaries. */
  salaryDecayPct?: number;
  onSalaryDecayPctChange?: (v: number | undefined) => void;
  salaryDecayPctError?: string;
}

interface AdvancedNumberFieldProps {
  label: string;
  hint: string;
  testID: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string;
}

function AdvancedNumberField({
  label,
  hint,
  testID,
  value,
  onChange,
  placeholder,
  disabled,
  error,
}: AdvancedNumberFieldProps): React.JSX.Element {
  return (
    <LeagueFieldRow label={label} hint={hint}>
      <XStack alignItems="center" gap="$3">
        <Input
          size="$3"
          testID={testID}
          value={value !== undefined ? String(value) : ''}
          onChangeText={(text: string) => {
            const n = parseInt(text, 10);
            onChange(isNaN(n) ? undefined : n);
          }}
          placeholder={placeholder}
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
  );
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
  salaryFloor,
  onSalaryFloorChange,
  salaryFloorError,
  luxuryTaxThreshold,
  onLuxuryTaxThresholdChange,
  luxuryTaxThresholdError,
  minSalary,
  onMinSalaryChange,
  minSalaryError,
  salaryEscalationPct,
  onSalaryEscalationPctChange,
  salaryEscalationPctError,
  salaryDecayPct,
  onSalaryDecayPctChange,
  salaryDecayPctError,
}: SalaryCapFieldProps): React.JSX.Element {
  // Non-premium viewers get a hard-disabled toggle/input, not just a visual
  // tease from the caller's PremiumGate — PremiumGate only blocks pointer
  // events, so keyboard or programmatic activation could still reach these
  // controls if they weren't also disabled here (LS-6114).
  const gated = disabled || !isPremium;

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
          disabled={gated}
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
              disabled={gated}
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

      {enabled && onSalaryFloorChange && (
        <AdvancedNumberField
          label="Salary Floor"
          hint="Minimum total salary each team must spend (optional)"
          testID="create-league-salary-floor-input"
          value={salaryFloor}
          onChange={onSalaryFloorChange}
          placeholder="e.g. 40000000"
          disabled={disabled}
          error={salaryFloorError}
        />
      )}

      {enabled && onLuxuryTaxThresholdChange && (
        <AdvancedNumberField
          label="Luxury Tax Threshold"
          hint="Total salary above which luxury tax applies (optional)"
          testID="create-league-luxury-tax-threshold-input"
          value={luxuryTaxThreshold}
          onChange={onLuxuryTaxThresholdChange}
          placeholder="e.g. 60000000"
          disabled={disabled}
          error={luxuryTaxThresholdError}
        />
      )}

      {enabled && onMinSalaryChange && (
        <AdvancedNumberField
          label="Minimum Player Salary"
          hint="Lowest salary any single player can be assigned (optional)"
          testID="create-league-min-salary-input"
          value={minSalary}
          onChange={onMinSalaryChange}
          placeholder="e.g. 1"
          disabled={disabled}
          error={minSalaryError}
        />
      )}

      {enabled && onSalaryEscalationPctChange && (
        <AdvancedNumberField
          label="Salary Escalation %"
          hint="Year-over-year raise applied to rostered players' salaries (optional)"
          testID="create-league-salary-escalation-pct-input"
          value={salaryEscalationPct}
          onChange={onSalaryEscalationPctChange}
          placeholder="e.g. 10"
          disabled={disabled}
          error={salaryEscalationPctError}
        />
      )}

      {enabled && onSalaryDecayPctChange && (
        <AdvancedNumberField
          label="Salary Decay %"
          hint="Year-over-year decay applied to non-rostered players' salaries (optional)"
          testID="create-league-salary-decay-pct-input"
          value={salaryDecayPct}
          onChange={onSalaryDecayPctChange}
          placeholder="e.g. 25"
          disabled={disabled}
          error={salaryDecayPctError}
        />
      )}
    </YStack>
  );
}
