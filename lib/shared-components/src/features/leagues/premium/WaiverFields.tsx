// Waiver-system and FAAB-budget fields for league creation (LS-5174).
//
// `WaiverSystemField` is always visible; selecting FAAB while not premium routes
// to `onUpgrade` instead of switching. `FaabBudgetField` (shown only when FAAB is
// selected) is a premium control — callers wrap it in their platform's
// PremiumGate. Shared by web and mobile.

import React, { useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import { LeagueFieldRow, OptionButtonGroup } from './_controls';
import {
  FAAB_BUDGET_OPTIONS,
  WAIVER_TYPE_OPTIONS,
  type WaiverType,
} from './constants';
import { Spinner } from '../../../components/Spinner';

export interface WaiverSystemFieldProps {
  value: WaiverType;
  onChange: (v: WaiverType) => void;
  /** Whether the viewer can select the premium FAAB option. */
  isPremium: boolean;
  /**
   * True while premium entitlement is still resolving. While loading, the
   * FAAB option is neither "locked" nor selectable — a premium viewer must
   * not have an upgrade prompt fired at them just because their entitlement
   * hasn't confirmed yet (LS-6100). The whole group is disabled with a
   * spinner until `isPremium` reflects a resolved status.
   */
  loading?: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to select FAAB. */
  onUpgrade: () => void;
}

export function WaiverSystemField({
  value,
  onChange,
  isPremium,
  loading = false,
  disabled = false,
  onUpgrade,
}: WaiverSystemFieldProps): React.JSX.Element {
  return (
    <LeagueFieldRow
      label="Waiver System"
      hint={
        value === 'faab'
          ? 'FAAB: weekly blind bidding on free agents.'
          : 'Teams have a priority order'
      }
    >
      <XStack gap="$2" alignItems="center">
        <OptionButtonGroup<WaiverType>
          value={value}
          testIDPrefix="create-league-waiver-type"
          // Proactively lock the premium FAAB option for free viewers so the
          // gate is visible before selection (LS-5173); the onChange below
          // still routes a locked FAAB tap to onUpgrade. While loading, skip
          // the "locked" treatment entirely — entitlement isn't resolved yet,
          // so we don't know whether to show it as gated (LS-6100).
          options={WAIVER_TYPE_OPTIONS.map((o) => ({
            ...o,
            locked: o.value === 'faab' && !isPremium && !loading,
          }))}
          onChange={(v) => {
            if (loading) return;
            if (v === 'faab' && !isPremium) {
              onUpgrade();
              return;
            }
            onChange(v);
          }}
          disabled={disabled || loading}
          wide
        />
        {loading && <Spinner size="sm" inline />}
      </XStack>
    </LeagueFieldRow>
  );
}

const CUSTOM_FAAB_OPTION = 'custom' as const;

type FaabBudgetPreset = (typeof FAAB_BUDGET_OPTIONS)[number];

function isPresetFaabBudget(v: number): v is FaabBudgetPreset {
  return (FAAB_BUDGET_OPTIONS as readonly number[]).includes(v);
}

export interface FaabBudgetFieldProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Validation message for a custom budget amount, if any. */
  error?: string;
}

export function FaabBudgetField({
  value,
  onChange,
  disabled = false,
  error,
}: FaabBudgetFieldProps): React.JSX.Element {
  // Opens directly in Custom mode when the incoming value isn't a preset
  // (e.g. a draft/edit flow with a previously-saved custom amount) so it's
  // never silently clobbered.
  const [customMode, setCustomMode] = useState(!isPresetFaabBudget(value));
  const [customText, setCustomText] = useState(
    !isPresetFaabBudget(value) ? String(value) : '',
  );

  return (
    <LeagueFieldRow
      label="FAAB Budget (per manager)"
      hint="Each manager starts the season with this budget."
    >
      <YStack gap="$2">
        <OptionButtonGroup<FaabBudgetPreset | typeof CUSTOM_FAAB_OPTION>
          value={customMode ? CUSTOM_FAAB_OPTION : (value as FaabBudgetPreset)}
          testIDPrefix="create-league-faab-budget"
          options={[
            ...FAAB_BUDGET_OPTIONS.map((v) => ({ value: v, label: `$${v}` })),
            { value: CUSTOM_FAAB_OPTION, label: 'Custom' },
          ]}
          onChange={(v) => {
            if (v === CUSTOM_FAAB_OPTION) {
              // Don't touch the committed value until the user types one —
              // avoids silently submitting a stale/default number under the
              // "Custom" label.
              setCustomMode(true);
              setCustomText('');
              return;
            }
            setCustomMode(false);
            onChange(v);
          }}
          disabled={disabled}
        />
        {customMode && (
          <XStack alignItems="center" gap="$3">
            <Input
              size="$3"
              testID="create-league-faab-budget-custom-input"
              aria-label="FAAB Budget (per manager)"
              value={customText}
              onChangeText={(text: string) => {
                setCustomText(text);
                const n = parseInt(text, 10);
                if (!isNaN(n)) onChange(n);
              }}
              placeholder="Enter amount"
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
        )}
      </YStack>
    </LeagueFieldRow>
  );
}
