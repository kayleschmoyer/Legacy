import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { Minus } from '@tamagui/lucide-icons/icons/Minus';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import {
  WIZARD_TAP_TARGET,
  WizardBottomBar,
  WizardChipGroup,
  type WizardChipOption,
  WizardFieldRow,
  WizardHeader,
  WizardLimitBanner,
  WizardPrimaryCta,
  WizardProgressStrip,
  WizardSubCard,
  WizardSummaryCard,
  WizardSummaryRow,
  WizardTextField,
  WizardToggleRow,
} from './chrome';
import {
  applyWizardFieldChange,
  AUCTION_BUDGET_RANGE,
  AUCTION_MIN_BID_RANGE,
  createInitialWizardForm,
  DEFENSIVE_FORMAT_OPTIONS,
  type DefensiveFormatChoice,
  DIVISION_COUNT_OPTIONS,
  divisionsHint,
  DRAFT_MODE_OPTIONS,
  DRAFT_ORDER_OPTIONS,
  FOOTBALL_ROSTER_SLOT_LABELS,
  FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT,
  FREE_LEAGUE_LIMIT,
  LEAGUE_NAME_MAX_LENGTH,
  LEAGUE_NAME_MIN_LENGTH,
  type LeagueCreateWizardForm,
  PLAYER_POOL_OPTIONS_BY_SPORT,
  ROSTER_SIZE_OPTIONS_BY_SPORT,
  SCHEDULING_STRATEGY_OPTIONS,
  SCORING_FORMAT_OPTIONS,
  SELECTION_METHOD_OPTIONS_BY_SPORT,
  TEAM_COUNT_OPTIONS_BY_SPORT,
  validDivisionOptions,
  WIZARD_STEP_TITLES,
  WIZARD_STEPS,
  type WizardSport,
  type WizardStepId,
} from './constants';
import {
  validateWizardAll,
  validateWizardStep,
  type WizardErrors,
} from './validation';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { Skeleton } from '../../../components/Skeleton';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  INLINE_ERROR,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';
import { CustomEraRange } from '../premium/CustomEraRange';
import { DraftSlotTradingField } from '../premium/DraftSlotTradingField';
import { EraFilterGrid } from '../premium/EraFilterGrid';
import { ERAS_BY_SPORT } from '../premium/constants';
import { SalaryCapField } from '../premium/SalaryCapField';
import { FaabBudgetField, WaiverSystemField } from '../premium/WaiverFields';

/**
 * The "Line-score Wizard" league-create screen (LS-8809) — five steps (Basics →
 * Roster & Schedule → Draft → Rules → Review) sharing one header, a tappable
 * line-score progress strip, and an in-flow bottom bar.
 *
 * Purely presentational and cross-platform: the host app supplies the sport,
 * the subscription state, and the submit/cancel/upgrade callbacks. Currently
 * consumed by the mobile Create League route
 * (`apps/app/src/app/(app)/league/create.tsx`) — the same split LS-8795 used
 * for the Leagues tab and LS-8800 for the Games tab.
 *
 * Wizard state lives in a single form object here, so values survive
 * forward/back navigation and jumps from the review step's Edit links.
 */

const REVIEW_SUBTITLE = 'Check the card before it goes to the umpire.';
const REVIEW_HELPER = "You'll be commissioner. Invites open right after.";
const AUCTION_ORDER_HINT = 'Not used in auction';

export interface LeagueCreateWizardProps {
  sport: WizardSport;
  /** Seeds the league name (the `?name=` deep-link prefill). */
  initialLeagueName?: string;
  isPremium: boolean;
  /** While true the premium block holds a skeleton (LS-8380). */
  premiumLoading: boolean;
  /** Mutation in flight — disables the CTA and swaps its label. */
  submitting?: boolean;
  /** Mutation failure surfaced inline on the review step. */
  submitError?: string;
  /**
   * User is already at the free-tier league cap (LS-6133). Shows a banner and
   * blocks Next/Create up front instead of only failing on final submit.
   */
  atLeagueLimit?: boolean;
  onSubmit: (form: LeagueCreateWizardForm) => void;
  /** Close/cancel. The host decides whether to confirm — see `isDirty`. */
  onClose: (isDirty: boolean) => void;
  onUpgrade: (featureName: string) => void;
  /**
   * Fires when the Fast Lane toggle changes (LS-9179). This component stays
   * dependency-free (no analytics import) — the host wires this to its own
   * analytics module, same pattern as `onUpgrade`.
   */
  onFastLaneToggle?: (enabled: boolean) => void;
  /** Top safe-area inset, applied as padding so content clears the status bar. */
  topInset?: number;
}

export function LeagueCreateWizard({
  sport,
  initialLeagueName = '',
  isPremium,
  premiumLoading,
  submitting = false,
  submitError,
  atLeagueLimit = false,
  onSubmit,
  onClose,
  onUpgrade,
  onFastLaneToggle,
  topInset = 0,
}: LeagueCreateWizardProps): React.JSX.Element {
  const [form, setForm] = useState<LeagueCreateWizardForm>(() =>
    createInitialWizardForm(sport, initialLeagueName),
  );
  const pristineRef = useRef(form);
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [errors, setErrors] = useState<WizardErrors>({});
  // Fast Lane (LS-9179): mirrors the web accordion page's "lock everything
  // but Basic Settings" toggle (LS-9128), reinterpreted for a step wizard —
  // "locked" becomes "skipped". Turning it on jumps straight from Basics to
  // Review using the form's existing defaults for Roster/Draft/Rules; no
  // form data is reset, since those steps were never visited.
  const [fastLane, setFastLane] = useState(false);

  const step: WizardStepId = WIZARD_STEPS[stepIndex].id;
  const isReview = step === 'review';
  const disabled = submitting;

  const setField = useCallback(
    <K extends keyof LeagueCreateWizardForm>(
      field: K,
      value: LeagueCreateWizardForm[K],
    ) => {
      setForm((prev) => applyWizardFieldChange(prev, field, value));
      // Clearing on edit keeps a stale message from sitting under a field the
      // user has already corrected; the next NEXT press re-validates anyway.
      setErrors({});
    },
    [],
  );

  const isDirty = useMemo(() => {
    const pristine = pristineRef.current;
    return (Object.keys(pristine) as Array<keyof LeagueCreateWizardForm>).some(
      (key) => {
        const a = pristine[key];
        const b = form[key];
        if (a instanceof Date && b instanceof Date) {
          return a.getTime() !== b.getTime();
        }
        return a !== b;
      },
    );
  }, [form]);

  const goToStep = useCallback((index: number) => {
    setStepIndex(index);
    setErrors({});
  }, []);

  const toggleFastLane = useCallback(() => {
    setFastLane((prev) => {
      const next = !prev;
      onFastLaneToggle?.(next);
      return next;
    });
  }, [onFastLaneToggle]);

  const handleNext = useCallback(() => {
    const stepErrors = validateWizardStep(step, form, sport);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    const lastIndex = WIZARD_STEPS.length - 1;
    const next =
      fastLane && step === 'basics'
        ? lastIndex
        : Math.min(stepIndex + 1, lastIndex);
    setStepIndex(next);
    setFurthestIndex((prev) => Math.max(prev, next));
    setErrors({});
  }, [fastLane, form, sport, step, stepIndex]);

  const handleBack = useCallback(() => {
    if (stepIndex === 0) {
      onClose(isDirty);
      return;
    }
    goToStep(stepIndex - 1);
  }, [goToStep, isDirty, stepIndex, onClose]);

  const handleSubmit = useCallback(() => {
    // Belt-and-suspenders: the CTA is already disabled while atLeagueLimit,
    // but guard here too in case a caller reaches this without going through
    // the disabled button (LS-6133).
    if (atLeagueLimit) return;
    // Re-validate everything against the current clock: a draft date that was
    // in the future when picked can slip into the past while the user works
    // through the wizard.
    const allErrors = validateWizardAll(form, sport);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }
    onSubmit(form);
  }, [atLeagueLimit, form, onSubmit, sport]);

  const nameLength = form.leagueName.trim().length;
  const nameValid =
    nameLength >= LEAGUE_NAME_MIN_LENGTH &&
    nameLength <= LEAGUE_NAME_MAX_LENGTH;

  return (
    <YStack flex={1} backgroundColor={BG_DARK} paddingTop={topInset}>
      <WizardHeader
        sportLabel={sport === 'football' ? 'FOOTBALL' : 'BASEBALL'}
        onClose={() => onClose(isDirty)}
      />
      <WizardProgressStrip
        steps={WIZARD_STEPS}
        currentIndex={stepIndex}
        furthestIndex={furthestIndex}
        onSelectStep={goToStep}
      />

      <ScrollView flex={1} contentContainerStyle={{ flexGrow: 1 }}>
        <YStack paddingHorizontal={20} paddingVertical={18} gap={16}>
          {atLeagueLimit && (
            <WizardLimitBanner
              limit={FREE_LEAGUE_LIMIT}
              onUpgrade={() => onUpgrade('Unlimited League Creation')}
            />
          )}
          {step === 'basics' && (
            <BasicsStep
              form={form}
              sport={sport}
              errors={errors}
              disabled={disabled}
              setField={setField}
              fastLane={fastLane}
              onToggleFastLane={toggleFastLane}
            />
          )}
          {step === 'roster' && (
            <RosterStep
              form={form}
              sport={sport}
              errors={errors}
              disabled={disabled}
              setField={setField}
            />
          )}
          {step === 'draft' && (
            <DraftStep
              form={form}
              sport={sport}
              errors={errors}
              disabled={disabled}
              isPremium={isPremium}
              premiumLoading={premiumLoading}
              setField={setField}
              onUpgrade={onUpgrade}
            />
          )}
          {step === 'rules' && (
            <RulesStep
              form={form}
              sport={sport}
              errors={errors}
              disabled={disabled}
              isPremium={isPremium}
              premiumLoading={premiumLoading}
              setField={setField}
              onUpgrade={onUpgrade}
            />
          )}
          {isReview && (
            <ReviewStep
              form={form}
              sport={sport}
              isPremium={isPremium}
              errors={errors}
              submitError={submitError}
              onEditStep={goToStep}
            />
          )}
        </YStack>

        {isReview ? (
          <YStack paddingHorizontal={20} paddingTop={8} paddingBottom={24}>
            <WizardPrimaryCta
              label={submitting ? 'Creating…' : 'CREATE LEAGUE'}
              onPress={handleSubmit}
              disabled={submitting || atLeagueLimit}
              helperText={REVIEW_HELPER}
            />
          </YStack>
        ) : (
          <WizardBottomBar
            backLabel={stepIndex === 0 ? 'CANCEL' : 'BACK'}
            onBack={handleBack}
            nextLabel={`NEXT — ${
              fastLane && step === 'basics'
                ? WIZARD_STEPS[WIZARD_STEPS.length - 1].label
                : WIZARD_STEPS[stepIndex + 1].label
            }`}
            onNext={handleNext}
            nextDisabled={
              disabled || atLeagueLimit || (step === 'basics' && !nameValid)
            }
          />
        )}
      </ScrollView>
    </YStack>
  );
}

// ── Step 1: Basics ───────────────────────────────────────────────────────────

interface StepProps {
  form: LeagueCreateWizardForm;
  errors: WizardErrors;
  disabled: boolean;
  setField: <K extends keyof LeagueCreateWizardForm>(
    field: K,
    value: LeagueCreateWizardForm[K],
  ) => void;
}

interface SportStepProps extends StepProps {
  sport: WizardSport;
}

function numberChips(values: readonly number[]): WizardChipOption<number>[] {
  return values.map((value) => ({ value, label: String(value) }));
}

interface BasicsStepProps extends SportStepProps {
  fastLane: boolean;
  onToggleFastLane: () => void;
}

function BasicsStep({
  form,
  sport,
  errors,
  disabled,
  setField,
  fastLane,
  onToggleFastLane,
}: BasicsStepProps): React.JSX.Element {
  const allowedDivisions = validDivisionOptions(form.numberOfTeams);
  return (
    <>
      <WizardToggleRow
        testID="toggle-fastLane"
        title="Fast Lane"
        subtitle={
          fastLane
            ? 'Skipping to Review — using our recommended defaults for the rest.'
            : 'Skip the details, use our defaults.'
        }
        value={fastLane}
        onChange={onToggleFastLane}
        disabled={disabled}
      />

      <WizardFieldRow
        label="League Name"
        testID="field-leagueName"
        labelHint={`${form.leagueName.length}/${LEAGUE_NAME_MAX_LENGTH}`}
        error={errors.leagueName}
      >
        <WizardTextField
          testID="league-name-input"
          value={form.leagueName}
          onChangeText={(value) => setField('leagueName', value)}
          placeholder="Enter your league name"
          maxLength={LEAGUE_NAME_MAX_LENGTH}
          disabled={disabled}
          invalid={errors.leagueName !== undefined}
        />
      </WizardFieldRow>

      <WizardFieldRow
        label="Number of Teams"
        testID="field-numberOfTeams"
        hint={
          form.numberOfTeams % 2 === 1
            ? 'Teams are odd — divisions must also be odd, and one team will have a bye each week.'
            : 'Even numbers produce the cleanest divisions. 12 is standard.'
        }
        error={errors.numberOfTeams}
      >
        <WizardChipGroup
          testIDPrefix="chip-numberOfTeams"
          value={form.numberOfTeams}
          options={numberChips(TEAM_COUNT_OPTIONS_BY_SPORT[sport])}
          onChange={(value) => setField('numberOfTeams', value)}
          disabled={disabled}
        />
      </WizardFieldRow>

      <WizardFieldRow
        label="Number of Divisions"
        testID="field-numberOfDivisions"
        hint={divisionsHint(form.numberOfTeams)}
        error={errors.numberOfDivisions}
      >
        <WizardChipGroup
          testIDPrefix="chip-numberOfDivisions"
          value={form.numberOfDivisions}
          options={DIVISION_COUNT_OPTIONS.map((value) => ({
            value,
            label: String(value),
            disabled: !allowedDivisions.includes(value),
          }))}
          onChange={(value) => setField('numberOfDivisions', value)}
          disabled={disabled}
        />
      </WizardFieldRow>

      <WizardToggleRow
        testID="toggle-isPublic"
        title="Public League"
        subtitle={
          form.isPublic
            ? 'Anyone signed in can browse and join this league.'
            : 'Only people with your invite code can join.'
        }
        value={form.isPublic}
        onChange={(value) => setField('isPublic', value)}
        disabled={disabled}
      />
    </>
  );
}

// ── Step 2: Roster & Schedule ────────────────────────────────────────────────

function RosterStep({
  form,
  sport,
  errors,
  disabled,
  setField,
}: SportStepProps): React.JSX.Element {
  const singleDivision = form.numberOfDivisions === 1;
  return (
    <>
      <WizardFieldRow
        label="Scheduling Strategy"
        testID="field-schedulingStrategy"
        hint={
          singleDivision
            ? "Only 1 division — Divisional would be identical to Round-Robin, so it's disabled."
            : 'Divisional schedules prioritize in-division matchups.'
        }
      >
        <WizardChipGroup
          testIDPrefix="chip-schedulingStrategy"
          value={form.schedulingStrategy}
          options={SCHEDULING_STRATEGY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.value === 'divisional' && singleDivision,
          }))}
          onChange={(value) => setField('schedulingStrategy', value)}
          disabled={disabled}
        />
      </WizardFieldRow>

      {sport === 'football' ? (
        <FootballRosterSlotsField
          rosterSlots={form.rosterSlots}
          defensiveFormat={form.defensiveFormat}
          error={errors.maxRosterSize}
          disabled={disabled}
          onChange={(next) => setField('rosterSlots', next)}
        />
      ) : (
        <WizardFieldRow
          label="Roster Size"
          testID="field-maxRosterSize"
          hint="Number of players each team can carry."
          error={errors.maxRosterSize}
        >
          <WizardChipGroup
            testIDPrefix="chip-maxRosterSize"
            value={form.maxRosterSize}
            options={numberChips(ROSTER_SIZE_OPTIONS_BY_SPORT[sport])}
            onChange={(value) => setField('maxRosterSize', value)}
            disabled={disabled}
          />
        </WizardFieldRow>
      )}

      <WizardFieldRow
        label="Player Pool"
        testID="field-playerPool"
        hint="Which players can be drafted in this league."
      >
        <WizardChipGroup
          testIDPrefix="chip-playerPool"
          value={form.playerPool}
          options={PLAYER_POOL_OPTIONS_BY_SPORT[sport].map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(value) => setField('playerPool', value)}
          disabled={disabled}
        />
      </WizardFieldRow>
    </>
  );
}

interface FootballRosterSlotsFieldProps {
  rosterSlots: Record<string, number>;
  defensiveFormat: DefensiveFormatChoice;
  error?: string;
  disabled: boolean;
  onChange: (rosterSlots: Record<string, number>) => void;
}

/**
 * Per-position roster config for football (LS-6146) — lets a manager say "3
 * WRs, not 2" instead of only picking a total roster size. Slot order and
 * defaults switch with the defensive format (D/ST vs IDP), which is why this
 * reads `form.defensiveFormat` even though that field is chosen later, on the
 * Rules step — the wizard keeps all fields in one form object, so revisiting
 * this step after changing format shows the right slots.
 */
function FootballRosterSlotsField({
  rosterSlots,
  defensiveFormat,
  error,
  disabled,
  onChange,
}: FootballRosterSlotsFieldProps): React.JSX.Element {
  const slotOrder = FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT[defensiveFormat];
  const totalStarters = slotOrder
    .filter((slot) => slot !== 'BN')
    .reduce((sum, slot) => sum + (rosterSlots[slot] ?? 0), 0);
  const bench = rosterSlots.BN ?? 0;

  function adjust(slot: string, delta: number) {
    const next = Math.max(0, (rosterSlots[slot] ?? 0) + delta);
    onChange({ ...rosterSlots, [slot]: next });
  }

  return (
    <WizardFieldRow
      label="Roster Positions"
      testID="field-rosterSlots"
      hint="Number of players at each position. Roster size is the total."
      error={error}
    >
      <YStack gap={8}>
        <XStack
          testID="roster-slots-totals"
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
            Total: {totalStarters + bench}
          </Text>
        </XStack>
        {slotOrder.map((slot) => (
          <RosterSlotRow
            key={slot}
            testID={`roster-slot-${slot}`}
            slot={slot}
            count={rosterSlots[slot] ?? 0}
            disabled={disabled}
            onIncrement={() => adjust(slot, 1)}
            onDecrement={() => adjust(slot, -1)}
          />
        ))}
      </YStack>
    </WizardFieldRow>
  );
}

function RosterSlotRow({
  testID,
  slot,
  count,
  disabled,
  onIncrement,
  onDecrement,
}: {
  testID: string;
  slot: string;
  count: number;
  disabled: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}): React.JSX.Element {
  const canDecrement = !disabled && count > 0;
  const canIncrement = !disabled;
  return (
    <XStack
      testID={testID}
      alignItems="center"
      justifyContent="space-between"
      padding={12}
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={10}
    >
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
      <XStack alignItems="center" gap={12}>
        <XStack
          testID={`${testID}-decrement`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${slot}`}
          aria-label={`Decrease ${slot}`}
          accessibilityState={{ disabled: !canDecrement }}
          aria-disabled={!canDecrement}
          onPress={() => canDecrement && onDecrement()}
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
          onPress={() => canIncrement && onIncrement()}
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

// ── Step 3: Draft ────────────────────────────────────────────────────────────

interface PremiumStepProps extends StepProps {
  isPremium: boolean;
  premiumLoading: boolean;
  onUpgrade: (featureName: string) => void;
}

function DraftStep({
  form,
  sport,
  errors,
  disabled,
  isPremium,
  premiumLoading,
  setField,
  onUpgrade,
}: PremiumStepProps & { sport: WizardSport }): React.JSX.Element {
  const isAuction = form.selectionMethod === 'auction';
  const automated = form.draftMode === 'automated';
  return (
    <>
      <WizardFieldRow
        label="Draft Mode"
        testID="field-draftMode"
        hint="Live requires managers online; automated runs on a schedule."
      >
        <WizardChipGroup
          testIDPrefix="chip-draftMode"
          value={form.draftMode}
          options={DRAFT_MODE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(value) => setField('draftMode', value)}
          disabled={disabled}
        />
      </WizardFieldRow>

      <WizardFieldRow
        label="Selection Method"
        testID="field-selectionMethod"
        hint={
          automated
            ? 'Automated drafts always use Random selection.'
            : 'Standard picks, auction bidding, or random assignment.'
        }
      >
        <WizardChipGroup
          testIDPrefix="chip-selectionMethod"
          value={form.selectionMethod}
          options={SELECTION_METHOD_OPTIONS_BY_SPORT[sport].map((option) => ({
            value: option.value,
            label: option.label,
            // Auction draft is a premium selection method (LS-6125) — it
            // implicitly requires a budget, the same gate as salary-cap
            // leagues. Lock it for free users so the gate is visible before
            // selection; the onChange below still routes a locked tap to the
            // upgrade modal instead of applying the selection. Mirrors the
            // web LeagueCreatePage's ButtonGroup gating (LS-6072).
            locked:
              option.value === 'auction' && (!isPremium || premiumLoading),
          }))}
          onChange={(value) => {
            if (value === 'auction' && (!isPremium || premiumLoading)) {
              onUpgrade('Auction Draft');
              return;
            }
            setField('selectionMethod', value);
          }}
          disabled={disabled || automated}
        />
      </WizardFieldRow>

      {isAuction && (
        <WizardSubCard label="AUCTION SETTINGS" testID="auction-settings">
          <WizardFieldRow
            label="Budget per team"
            testID="field-auctionBudget"
            error={errors.auctionBudget}
          >
            <WizardTextField
              testID="auction-budget-input"
              value={String(form.auctionBudget)}
              onChangeText={(text) =>
                setField(
                  'auctionBudget',
                  clampNumeric(text, AUCTION_BUDGET_RANGE),
                )
              }
              keyboardType="number-pad"
              disabled={disabled}
              invalid={errors.auctionBudget !== undefined}
            />
          </WizardFieldRow>
          <WizardFieldRow
            label="Minimum bid"
            testID="field-auctionMinBid"
            error={errors.auctionMinBid}
          >
            <WizardTextField
              testID="auction-min-bid-input"
              value={String(form.auctionMinBid)}
              onChangeText={(text) =>
                setField(
                  'auctionMinBid',
                  clampNumeric(text, AUCTION_MIN_BID_RANGE),
                )
              }
              keyboardType="number-pad"
              disabled={disabled}
              invalid={errors.auctionMinBid !== undefined}
            />
          </WizardFieldRow>
        </WizardSubCard>
      )}

      <WizardFieldRow
        label="Draft Order"
        testID="field-draftOrder"
        hint={
          isAuction
            ? AUCTION_ORDER_HINT
            : 'Snake order reverses each round; linear stays the same.'
        }
      >
        <WizardChipGroup
          testIDPrefix="chip-draftOrder"
          value={form.draftOrder}
          options={DRAFT_ORDER_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(value) => setField('draftOrder', value)}
          disabled={disabled || isAuction}
        />
      </WizardFieldRow>

      <WizardFieldRow
        label="Draft Date & Time"
        testID="field-draftDate"
        error={errors.draftDate}
      >
        <DateTimePicker
          value={form.draftDate}
          onChange={(date: Date) => setField('draftDate', date)}
          placeholder="Select draft date and time"
          disabled={disabled}
          minDate={new Date()}
        />
      </WizardFieldRow>

      {/* Draft slot trading is hidden for auction leagues — there are no slots
          to trade and the server rejects it (LS-8675). */}
      {!isAuction &&
        (premiumLoading ? (
          <Skeleton height={72} radius={12} />
        ) : (
          <DraftSlotTradingField
            enabled={form.allowDraftSlotTrading}
            onToggleEnabled={(value: boolean) =>
              setField('allowDraftSlotTrading', value)
            }
            isPremium={isPremium}
            disabled={disabled}
            onUpgrade={() => onUpgrade('Draft Slot Trading')}
          />
        ))}
    </>
  );
}

/** Parse a numeric text input and clamp it to a range; empty input reads as the minimum. */
function clampNumeric(
  text: string,
  range: { min: number; max: number },
): number {
  const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(parsed)) return range.min;
  return Math.min(Math.max(parsed, range.min), range.max);
}

// ── Step 4: Rules ────────────────────────────────────────────────────────────

function RulesStep({
  form,
  sport,
  errors,
  disabled,
  isPremium,
  premiumLoading,
  setField,
  onUpgrade,
}: PremiumStepProps & { sport: WizardSport }): React.JSX.Element {
  // While the entitlement fetch is in flight, hold a neutral placeholder rather
  // than the locked treatment — otherwise a premium user briefly sees
  // themselves treated as free on cold load (LS-8380).
  if (premiumLoading) {
    return (
      <YStack
        gap={12}
        testID="premium-settings-loading"
        accessibilityLabel="Loading premium settings"
      >
        <Skeleton height={72} radius={12} />
        <Skeleton height={56} radius={12} />
        <Skeleton height={56} radius={12} />
      </YStack>
    );
  }

  return (
    <>
      {sport === 'football' && (
        <>
          <WizardFieldRow
            label="Scoring Format"
            testID="field-scoringFormat"
            hint="Sets the reception bonus. All other stats are identical."
          >
            <WizardChipGroup
              testIDPrefix="chip-scoringFormat"
              value={form.scoringFormat}
              options={SCORING_FORMAT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) => setField('scoringFormat', value)}
              disabled={disabled}
            />
          </WizardFieldRow>

          <WizardFieldRow
            label="Defensive Format"
            testID="field-defensiveFormat"
            hint="D/ST uses one team defense slot. IDP uses individual defensive players."
          >
            <WizardChipGroup
              testIDPrefix="chip-defensiveFormat"
              value={form.defensiveFormat}
              options={DEFENSIVE_FORMAT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) => setField('defensiveFormat', value)}
              disabled={disabled}
            />
          </WizardFieldRow>
        </>
      )}

      <WizardFieldRow
        label="Historical Era Filter"
        testID="field-eraFilter"
        hint="Only players active during this window are draftable."
        error={errors.customEra}
      >
        <EraFilterGrid
          sport={sport}
          value={form.baseballEraFilter}
          onChange={(value: string) => setField('baseballEraFilter', value)}
          isPremium={isPremium}
          disabled={disabled}
          onUpgrade={() => onUpgrade('Historical Era Selection')}
        />
      </WizardFieldRow>

      {form.baseballEraFilter === 'custom' && (
        <WizardSubCard label="CUSTOM ERA YEARS" testID="custom-era-settings">
          <CustomEraRange
            startYear={form.customEraStartYear}
            endYear={form.customEraEndYear}
            onChangeStart={(value: number | undefined) =>
              setField('customEraStartYear', value)
            }
            onChangeEnd={(value: number | undefined) =>
              setField('customEraEndYear', value)
            }
            disabled={disabled}
          />
        </WizardSubCard>
      )}

      <WizardToggleRow
        testID="toggle-baseballHofOnly"
        title="Hall of Fame Only"
        subtitle="Restrict the player pool to Hall of Famers."
        value={form.baseballHofOnly}
        onChange={(value) => {
          if (!isPremium) {
            onUpgrade('Hall of Fame Only');
            return;
          }
          setField('baseballHofOnly', value);
        }}
        disabled={disabled}
      />

      <WaiverSystemField
        value={form.waiverType}
        onChange={(value) => setField('waiverType', value)}
        isPremium={isPremium}
        disabled={disabled}
        onUpgrade={() => onUpgrade('FAAB Waiver Settings')}
      />

      {form.waiverType === 'faab' && isPremium && (
        <WizardSubCard label="FAAB BUDGET" testID="faab-settings">
          <FaabBudgetField
            value={form.faabBudgetDefault}
            onChange={(value: number) => setField('faabBudgetDefault', value)}
            disabled={disabled}
          />
        </WizardSubCard>
      )}

      <SalaryCapField
        enabled={form.salaryCapEnabled}
        amount={form.salaryCap}
        onToggleEnabled={(value: boolean) =>
          setField('salaryCapEnabled', value)
        }
        onAmountChange={(value: number | undefined) =>
          setField('salaryCap', value)
        }
        isPremium={isPremium}
        disabled={disabled}
        error={errors.salaryCap}
        onUpgrade={() => onUpgrade('Salary Cap')}
        numberOfTeams={form.numberOfTeams}
        maxRosterSize={form.maxRosterSize}
      />
    </>
  );
}

// ── Step 5: Review ───────────────────────────────────────────────────────────

function labelFor<T extends string | number>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? '—';
}

function eraLabel(form: LeagueCreateWizardForm, sport: WizardSport): string {
  if (form.baseballEraFilter === 'custom') {
    return `${form.customEraStartYear ?? '—'} – ${form.customEraEndYear ?? '—'}`;
  }
  return (
    ERAS_BY_SPORT[sport].find((era) => era.id === form.baseballEraFilter)
      ?.name ?? '—'
  );
}

function draftDateLabel(date: Date | undefined): string {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ReviewStep({
  form,
  sport,
  isPremium,
  errors,
  submitError,
  onEditStep,
}: {
  form: LeagueCreateWizardForm;
  sport: WizardSport;
  isPremium: boolean;
  errors: WizardErrors;
  submitError?: string;
  onEditStep: (index: number) => void;
}): React.JSX.Element {
  const errorMessages = Object.values(errors);
  const isAuction = form.selectionMethod === 'auction';
  return (
    <>
      <YStack gap={4}>
        <Text
          testID="review-league-name"
          fontFamily="$heading"
          fontWeight="800"
          fontSize={30}
          color={TEXT_PRIMARY}
        >
          {form.leagueName.trim() || 'Untitled League'}
        </Text>
        <Text
          fontFamily="$body"
          fontStyle="italic"
          fontSize={14}
          color={TEXT_MUTED}
        >
          {REVIEW_SUBTITLE}
        </Text>
      </YStack>

      <WizardSummaryCard
        testID="summary-basics"
        title={WIZARD_STEP_TITLES.basics}
        onEdit={() => onEditStep(0)}
      >
        <WizardSummaryRow label="Teams" value={String(form.numberOfTeams)} />
        <WizardSummaryRow
          label="Divisions"
          value={String(form.numberOfDivisions)}
        />
        <WizardSummaryRow
          label="Visibility"
          value={form.isPublic ? 'Public' : 'Private'}
        />
      </WizardSummaryCard>

      <WizardSummaryCard
        testID="summary-roster"
        title={WIZARD_STEP_TITLES.roster}
        onEdit={() => onEditStep(1)}
      >
        <WizardSummaryRow
          label="Schedule"
          value={labelFor(SCHEDULING_STRATEGY_OPTIONS, form.schedulingStrategy)}
        />
        <WizardSummaryRow
          label="Roster"
          value={`${form.maxRosterSize} players`}
        />
        <WizardSummaryRow
          label="Pool"
          value={labelFor(PLAYER_POOL_OPTIONS_BY_SPORT[sport], form.playerPool)}
        />
      </WizardSummaryCard>

      <WizardSummaryCard
        testID="summary-draft"
        title={WIZARD_STEP_TITLES.draft}
        onEdit={() => onEditStep(2)}
      >
        <WizardSummaryRow
          label="Mode"
          value={labelFor(DRAFT_MODE_OPTIONS, form.draftMode)}
        />
        <WizardSummaryRow
          label="Selection"
          value={labelFor(
            SELECTION_METHOD_OPTIONS_BY_SPORT[sport],
            form.selectionMethod,
          )}
        />
        {isAuction ? (
          <WizardSummaryRow
            label="Auction"
            value={`$${form.auctionBudget} · min $${form.auctionMinBid}`}
          />
        ) : (
          <WizardSummaryRow
            label="Order"
            value={labelFor(DRAFT_ORDER_OPTIONS, form.draftOrder)}
          />
        )}
        <WizardSummaryRow label="Date" value={draftDateLabel(form.draftDate)} />
        {!isAuction && (
          <WizardSummaryRow
            label="Slot Trading"
            value={form.allowDraftSlotTrading ? 'On' : 'Off'}
            premiumLocked={!isPremium && !form.allowDraftSlotTrading}
          />
        )}
      </WizardSummaryCard>

      <WizardSummaryCard
        testID="summary-rules"
        title={WIZARD_STEP_TITLES.rules}
        onEdit={() => onEditStep(3)}
      >
        {sport === 'football' && (
          <>
            <WizardSummaryRow
              label="Scoring"
              value={labelFor(SCORING_FORMAT_OPTIONS, form.scoringFormat)}
            />
            <WizardSummaryRow
              label="Defense"
              value={labelFor(DEFENSIVE_FORMAT_OPTIONS, form.defensiveFormat)}
            />
          </>
        )}
        <WizardSummaryRow label="Era" value={eraLabel(form, sport)} />
        <WizardSummaryRow
          label="HOF Only"
          value={form.baseballHofOnly ? 'On' : 'Off'}
          premiumLocked={!isPremium && !form.baseballHofOnly}
        />
        <WizardSummaryRow
          label="Waivers"
          value={
            form.waiverType === 'faab'
              ? `FAAB · $${form.faabBudgetDefault}`
              : 'Standard'
          }
          premiumLocked={!isPremium && form.waiverType !== 'faab'}
        />
        <WizardSummaryRow
          label="Salary Cap"
          value={form.salaryCapEnabled ? `$${form.salaryCap ?? 0}` : 'Off'}
          premiumLocked={!isPremium && !form.salaryCapEnabled}
        />
      </WizardSummaryCard>

      {(errorMessages.length > 0 || submitError !== undefined) && (
        <YStack
          testID="review-errors"
          accessibilityRole="alert"
          gap={4}
          padding={12}
          borderWidth={1}
          borderRadius={12}
          borderColor={withAlpha(INLINE_ERROR, 0.4)}
          backgroundColor={withAlpha(INLINE_ERROR, 0.1)}
        >
          {submitError !== undefined && (
            <Text fontFamily="$body" fontSize={13} color={INLINE_ERROR}>
              {submitError}
            </Text>
          )}
          {errorMessages.map((message) => (
            <Text
              key={message}
              fontFamily="$body"
              fontSize={13}
              color={INLINE_ERROR}
            >
              {message}
            </Text>
          ))}
        </YStack>
      )}
    </>
  );
}
