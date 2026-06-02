// Waiver-system and FAAB-budget fields for league creation (LS-5174).
//
// `WaiverSystemField` is always visible; selecting FAAB while not premium routes
// to `onUpgrade` instead of switching. `FaabBudgetField` (shown only when FAAB is
// selected) is a premium control — callers wrap it in their platform's
// PremiumGate. Shared by web and mobile.

import React from 'react';
import { LeagueFieldRow, OptionButtonGroup } from './_controls';
import {
  FAAB_BUDGET_OPTIONS,
  WAIVER_TYPE_OPTIONS,
  type WaiverType,
} from './constants';

export interface WaiverSystemFieldProps {
  value: WaiverType;
  onChange: (v: WaiverType) => void;
  /** Whether the viewer can select the premium FAAB option. */
  isPremium: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to select FAAB. */
  onUpgrade: () => void;
}

export function WaiverSystemField({
  value,
  onChange,
  isPremium,
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
      <OptionButtonGroup<WaiverType>
        value={value}
        testIDPrefix="create-league-waiver-type"
        options={WAIVER_TYPE_OPTIONS}
        onChange={(v) => {
          if (v === 'faab' && !isPremium) {
            onUpgrade();
            return;
          }
          onChange(v);
        }}
        disabled={disabled}
        wide
      />
    </LeagueFieldRow>
  );
}

export interface FaabBudgetFieldProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function FaabBudgetField({
  value,
  onChange,
  disabled = false,
}: FaabBudgetFieldProps): React.JSX.Element {
  return (
    <LeagueFieldRow
      label="FAAB Budget (per manager)"
      hint="Each manager starts the season with this budget."
    >
      <OptionButtonGroup<number>
        value={value}
        testIDPrefix="create-league-faab-budget"
        options={FAAB_BUDGET_OPTIONS.map((v) => ({ value: v, label: `$${v}` }))}
        onChange={onChange}
        disabled={disabled}
      />
    </LeagueFieldRow>
  );
}
