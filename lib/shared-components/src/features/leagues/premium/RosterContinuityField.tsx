// Roster-continuity control for league creation (LS-8672 keeper, LS-8386
// dynasty). A premium control: callers wrap it in their platform's
// PremiumGate. Choosing Keeper or Dynasty while not premium routes to
// `onUpgrade`. Shared by web/mobile.
//
// Three mutually exclusive modes, one control, because they are three points
// on the same axis rather than independent settings:
//   redraft : rosters reset every season (default, free)
//   keeper  : each team retains up to keeperCount players, at a cost
//   dynasty : full rosters persist at no cost; only unrostered players draft
// Dynasty is the strictest variant, so it has no configuration of its own —
// selecting it hides the keeper count / cost model / consecutive-keeps /
// rookie-exempt fields entirely, and the server rejects keeperSettings sent
// alongside it (validateKeeperConfig, LS-8671).
//
// Keeper mode requires selectionMethod 'standard' or 'auction' — 'random'
// (forced by automated drafts) has no valid keeper cost model, per
// validateKeeperConfig in lambdas/db/src/schema/leagues/mutations.ts
// (LS-8671). Dynasty carries no cost model, so it is valid under every
// selection method including 'random'. The caller is responsible for
// resetting rosterContinuity back to 'redraft' if selectionMethod changes to
// 'random' out from under an already-configured keeper league — this
// component only disables the affordance for turning Keeper *on* while
// unsupported.

import React from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import { LeagueFieldRow, OptionButtonGroup, PillToggle } from './_controls';
import { KEEPER_COST_MODEL_OPTIONS, type KeeperCostModel } from './constants';

export type RosterContinuity = 'redraft' | 'keeper' | 'dynasty';

/** The three roster-continuity modes, in increasing order of persistence. */
const ROSTER_CONTINUITY_OPTIONS: {
  value: RosterContinuity;
  label: string;
}[] = [
  { value: 'redraft', label: 'Redraft' },
  { value: 'keeper', label: 'Keeper' },
  { value: 'dynasty', label: 'Dynasty' },
];

/** Hint copy for the currently selected mode. */
function continuityHint(
  value: RosterContinuity,
  keeperSupported: boolean,
): string {
  if (value === 'dynasty') {
    return 'Dynasty: full rosters persist between seasons at no cost — each new season drafts only players nobody has rostered.';
  }
  if (value === 'keeper') {
    return 'Keeper: each team retains a limited number of players season-over-season.';
  }
  return keeperSupported
    ? 'Redraft: rosters reset every season. Keeper retains a limited number of players; Dynasty keeps full rosters.'
    : 'Redraft: rosters reset every season. Keeper mode requires Standard or Auction selection method; Dynasty is available for any.';
}

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
  /** Whether the viewer can enable Keeper or Dynasty mode. */
  isPremium: boolean;
  disabled?: boolean;
  /** Called when a non-premium viewer tries to leave Redraft. */
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
  const isKeeper = rosterContinuity === 'keeper';
  const selectionMethodSupportsKeeper = selectionMethod !== 'random';

  return (
    <YStack gap="$3">
      <LeagueFieldRow
        label="Roster Continuity"
        hint={continuityHint(rosterContinuity, selectionMethodSupportsKeeper)}
      >
        <OptionButtonGroup<RosterContinuity>
          value={rosterContinuity}
          testIDPrefix="create-league-roster-continuity"
          options={ROSTER_CONTINUITY_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            // Keeper alone needs a cost model, so it alone is unavailable
            // under a 'random' selection method (LS-8671).
            disabled: o.value === 'keeper' && !selectionMethodSupportsKeeper,
          }))}
          onChange={(v) => {
            if (v === 'redraft') {
              onRosterContinuityChange('redraft');
              return;
            }
            if (!isPremium) {
              onUpgrade();
              return;
            }
            if (v === 'keeper' && !selectionMethodSupportsKeeper) return;
            onRosterContinuityChange(v);
          }}
          disabled={gated}
        />
      </LeagueFieldRow>

      {/* Keeper configuration. Dynasty deliberately renders none of this:
          every player persists at no cost, so there is no count, no cost
          model, and no eligibility rule to configure (LS-8386 AC2). */}
      {isKeeper && selectionMethodSupportsKeeper && (
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
