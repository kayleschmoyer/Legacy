// Roster-continuity (keeper mode) control for league creation (LS-8672). A
// premium control: callers wrap it in their platform's PremiumGate. Enabling
// Keeper while not premium routes to `onUpgrade`. Shared by web/mobile.
//
// Keeper mode requires selectionMethod 'standard' or 'auction' — 'random'
// (forced by automated drafts) has no valid keeper cost model, per
// validateKeeperConfig in lambdas/db/src/schema/leagues/mutations.ts
// (LS-8671). The caller is responsible for resetting rosterContinuity back
// to 'redraft' if selectionMethod changes to 'random' out from under an
// already-configured keeper league — this component only disables the
// affordance for turning Keeper *on* while unsupported.

import React from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import { LeagueFieldRow, OptionButtonGroup, PillToggle } from './_controls';
import { KEEPER_COST_MODEL_OPTIONS, type KeeperCostModel } from './constants';

export type RosterContinuity = 'redraft' | 'keeper';

interface KeeperNumberFieldProps {
  label: string;
  hint: string;
  testID: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string;
}

function KeeperNumberField({
  label,
  hint,
  testID,
  value,
  onChange,
  placeholder,
  disabled,
  error,
}: KeeperNumberFieldProps): React.JSX.Element {
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

export interface RosterContinuityFieldProps {
  rosterContinuity: RosterContinuity;
  onRosterContinuityChange: (v: RosterContinuity) => void;
  /** Current draft selection method — constrains which keeper cost model is valid. */
  selectionMethod: 'standard' | 'auction' | 'random';
  keeperCount?: number;
  onKeeperCountChange: (v: number | undefined) => void;
  keeperCountError?: string;
  costModel?: KeeperCostModel;
  onCostModelChange: (v: KeeperCostModel) => void;
  maxConsecutiveKeeps?: number;
  onMaxConsecutiveKeepsChange: (v: number | undefined) => void;
  maxConsecutiveKeepsError?: string;
  rookieExempt: boolean;
  onRookieExemptChange: (v: boolean) => void;
  /** Whether the viewer can enable Keeper mode. */
  isPremium: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to enable Keeper mode. */
  onUpgrade: () => void;
}

export function RosterContinuityField({
  rosterContinuity,
  onRosterContinuityChange,
  selectionMethod,
  keeperCount,
  onKeeperCountChange,
  keeperCountError,
  costModel,
  onCostModelChange,
  maxConsecutiveKeeps,
  onMaxConsecutiveKeepsChange,
  maxConsecutiveKeepsError,
  rookieExempt,
  onRookieExemptChange,
  isPremium,
  disabled = false,
  onUpgrade,
}: RosterContinuityFieldProps): React.JSX.Element {
  // Non-premium viewers get a hard-disabled toggle, not just a visual tease
  // from the caller's PremiumGate — PremiumGate only blocks pointer events,
  // so keyboard or programmatic activation could still reach it otherwise
  // (mirrors SalaryCapField's LS-6114 treatment).
  const gated = disabled || !isPremium;
  const enabled = rosterContinuity === 'keeper';
  const selectionMethodSupportsKeeper = selectionMethod !== 'random';

  return (
    <YStack gap="$3">
      <LeagueFieldRow
        label="Roster Continuity"
        hint={
          selectionMethodSupportsKeeper
            ? 'Keeper: each team retains a limited number of players season-over-season.'
            : 'Keeper mode requires Standard or Auction selection method.'
        }
      >
        <PillToggle
          testID="create-league-keeper-toggle"
          value={enabled}
          offLabel="Redraft"
          onLabel="Keeper"
          onChange={(v) => {
            if (!v) {
              onRosterContinuityChange('redraft');
              return;
            }
            if (!isPremium) {
              onUpgrade();
              return;
            }
            if (!selectionMethodSupportsKeeper) return;
            onRosterContinuityChange('keeper');
          }}
          disabled={gated}
        />
      </LeagueFieldRow>

      {enabled && selectionMethodSupportsKeeper && (
        <>
          <KeeperNumberField
            label="Keeper Count"
            hint="Players each team may keep season-over-season (1-10)."
            testID="create-league-keeper-count-input"
            value={keeperCount}
            onChange={onKeeperCountChange}
            placeholder="e.g. 3"
            disabled={gated}
            error={keeperCountError}
          />

          <LeagueFieldRow
            label="Keeper Cost Model"
            hint={
              selectionMethod === 'auction'
                ? 'Auction Budget: a configured amount is deducted from the team budget.'
                : 'Round Penalty: the round the player was drafted in last season is forfeited.'
            }
          >
            <OptionButtonGroup<KeeperCostModel>
              value={costModel ?? KEEPER_COST_MODEL_OPTIONS[0].value}
              testIDPrefix="create-league-keeper-cost-model"
              options={KEEPER_COST_MODEL_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                disabled: o.requiresSelectionMethod !== selectionMethod,
              }))}
              onChange={onCostModelChange}
              disabled={gated}
            />
          </LeagueFieldRow>

          <KeeperNumberField
            label="Max Consecutive Keeps"
            hint="Seasons a player can be kept in a row before he re-enters the draft pool (optional; blank = unlimited)."
            testID="create-league-keeper-max-consecutive-input"
            value={maxConsecutiveKeeps}
            onChange={onMaxConsecutiveKeepsChange}
            placeholder="Unlimited"
            disabled={gated}
            error={maxConsecutiveKeepsError}
          />

          <LeagueFieldRow
            label="Rookie Exempt"
            hint="Rookies don't count against a team's keeper limit."
          >
            <PillToggle
              testID="create-league-keeper-rookie-exempt-toggle"
              value={rookieExempt}
              offLabel="No"
              onLabel="Yes"
              onChange={onRookieExemptChange}
              disabled={gated}
            />
          </LeagueFieldRow>
        </>
      )}
    </YStack>
  );
}
