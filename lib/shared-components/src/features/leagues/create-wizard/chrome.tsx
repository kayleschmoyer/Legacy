// Reusable chrome for the "Line-score Wizard" (LS-8809): header, progress
// strip, chip group, field row, text field, toggle row, conditional sub-card,
// bottom action bar, primary CTA, and the review summary card/row.
//
// Premium controls are not defined here — the wizard reuses the existing
// premium field components, which render their own locked treatment.
//
// Built from pressable Tamagui stacks (no `Button` dependency, no web-isms) so
// they render on both web and React Native, matching the `_controls.tsx`
// precedent. These are new components — the existing premium field components
// are reused as-is, so nothing here changes how web renders today.

import React from 'react';
import type { TextInputChangeEvent } from 'react-native';
import { Input, Text, XStack, YStack } from 'tamagui';
import { Check, Lock, X } from '@tamagui/lucide-icons';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  INLINE_ERROR,
  LEDGER_SUCCESS,
  OUTLINE_STRONG,
  PANEL_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_DISABLED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../../utils/colors';

/** Hairline divider between review-summary rows. */
const SUMMARY_HAIRLINE = withAlpha(WHITE, 0.05);

/** Minimum tap target for every interactive control in the wizard. */
export const WIZARD_TAP_TARGET = 44;

const RADIUS_CHIP = 10;
const RADIUS_CARD = 12;

// ── Header ───────────────────────────────────────────────────────────────────

export interface WizardHeaderProps {
  /** Sport chip copy — "BASEBALL" or "FOOTBALL". */
  sportLabel: string;
  onClose: () => void;
}

export function WizardHeader({
  sportLabel,
  onClose,
}: WizardHeaderProps): React.JSX.Element {
  return (
    <XStack
      testID="wizard-header"
      alignItems="center"
      justifyContent="space-between"
      paddingHorizontal={20}
      paddingVertical={16}
      gap={12}
    >
      <XStack
        testID="wizard-close"
        accessibilityRole="button"
        accessibilityLabel="Close league creation"
        aria-label="Close league creation"
        onPress={onClose}
        width={WIZARD_TAP_TARGET}
        height={WIZARD_TAP_TARGET}
        marginLeft={-12}
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        pressStyle={{ opacity: 0.6 }}
      >
        <X size={20} color={TEXT_MUTED} />
      </XStack>

      <Text
        flex={1}
        textAlign="center"
        fontFamily="$heading"
        fontWeight="900"
        fontSize={17}
        color={TEXT_PRIMARY}
      >
        Create League
      </Text>

      <Text
        testID="wizard-sport-chip"
        minWidth={WIZARD_TAP_TARGET}
        textAlign="right"
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.2}
        color={BRAND_GOLD_LIGHT}
      >
        {sportLabel}
      </Text>
    </XStack>
  );
}

// ── Progress strip ───────────────────────────────────────────────────────────

export interface WizardProgressStripProps {
  steps: ReadonlyArray<{ id: string; label: string }>;
  currentIndex: number;
  /** Highest step index the user has reached; later steps stay locked. */
  furthestIndex: number;
  onSelectStep: (index: number) => void;
}

/**
 * The line-score strip: five equal cells, one per step. Completed cells carry
 * a check and are tappable; the current cell has the gold underline; steps the
 * user has not reached yet are dimmed and inert.
 */
export function WizardProgressStrip({
  steps,
  currentIndex,
  furthestIndex,
  onSelectStep,
}: WizardProgressStripProps): React.JSX.Element {
  return (
    <XStack
      testID="wizard-progress-strip"
      accessibilityRole="tablist"
      role="tablist"
      marginHorizontal={20}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={RADIUS_CHIP}
      overflow="hidden"
    >
      {steps.map((step, index) => {
        const current = index === currentIndex;
        const completed = index < currentIndex;
        const visited = index <= furthestIndex;
        const tappable = visited && !current;
        return (
          <XStack
            key={step.id}
            testID={`wizard-step-tab-${step.id}`}
            flexDirection="column"
            flex={1}
            minHeight={WIZARD_TAP_TARGET}
            alignItems="center"
            justifyContent="center"
            gap={2}
            paddingVertical={8}
            backgroundColor={
              current ? SURFACE_CARD : completed ? SURFACE_PANEL : BG_DARK
            }
            borderBottomWidth={current ? 2 : 0}
            borderBottomColor={current ? BRAND_GOLD : 'transparent'}
            // `tab` rather than `button`: aria-selected is only meaningful on a
            // tab (or option/row), and the strip is a tablist of wizard steps.
            accessibilityRole="tab"
            role="tab"
            accessibilityLabel={`Step ${index + 1}: ${step.label}`}
            aria-label={`Step ${index + 1}: ${step.label}`}
            accessibilityState={{ disabled: !tappable, selected: current }}
            aria-selected={current}
            aria-disabled={!tappable}
            onPress={() => tappable && onSelectStep(index)}
            cursor={tappable ? 'pointer' : 'default'}
            pressStyle={tappable ? { opacity: 0.7 } : undefined}
          >
            <XStack alignItems="center" gap={3}>
              <Text
                fontFamily="$heading"
                fontWeight={current ? '800' : '700'}
                fontSize={10}
                letterSpacing={0.8}
                color={
                  current
                    ? BRAND_GOLD_LIGHT
                    : visited
                      ? TEXT_TERTIARY
                      : TEXT_DISABLED
                }
              >
                {step.label}
              </Text>
              {completed && (
                <XStack testID={`wizard-step-check-${step.id}`}>
                  <Check size={12} color={LEDGER_SUCCESS} />
                </XStack>
              )}
            </XStack>
            <Text
              fontFamily="$heading"
              fontWeight="700"
              fontSize={11}
              fontVariant={['tabular-nums']}
              color={
                current ? TEXT_PRIMARY : visited ? TEXT_TERTIARY : TEXT_DISABLED
              }
            >
              {index + 1}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

// ── Field row ────────────────────────────────────────────────────────────────

export interface WizardFieldRowProps {
  label: string;
  /** Right-aligned hint in the label row (e.g. the league-name counter). */
  labelHint?: string;
  /** Secondary hint rendered under the control. */
  hint?: string;
  /** Inline validation error, rendered in place of the hint. */
  error?: string;
  testID?: string;
  children: React.ReactNode;
}

export function WizardFieldRow({
  label,
  labelHint,
  hint,
  error,
  testID,
  children,
}: WizardFieldRowProps): React.JSX.Element {
  return (
    <YStack testID={testID} gap={8}>
      <XStack alignItems="center" justifyContent="space-between" gap={8}>
        <Text
          fontFamily="$body"
          fontWeight="700"
          fontSize={13}
          color={TEXT_PRIMARY}
        >
          {label}
        </Text>
        {labelHint !== undefined && (
          <Text
            fontFamily="$body"
            fontSize={11}
            color={TEXT_TERTIARY}
            fontVariant={['tabular-nums']}
          >
            {labelHint}
          </Text>
        )}
      </XStack>
      {children}
      {error !== undefined ? (
        <Text
          testID={testID ? `${testID}-error` : undefined}
          accessibilityRole="alert"
          fontFamily="$body"
          fontSize={12}
          color={INLINE_ERROR}
        >
          {error}
        </Text>
      ) : (
        hint !== undefined && (
          <Text fontFamily="$body" fontSize={11} color={TEXT_TERTIARY}>
            {hint}
          </Text>
        )
      )}
    </YStack>
  );
}

// ── Chip group ───────────────────────────────────────────────────────────────

export interface WizardChipOption<T extends string | number> {
  value: T;
  label: string;
  /** Unavailable choice — dimmed and inert (e.g. an invalid division count). */
  disabled?: boolean;
  /** Premium-gated choice — stays pressable so the caller can route to upgrade. */
  locked?: boolean;
}

export interface WizardChipGroupProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<WizardChipOption<T>>;
  onChange: (value: T) => void;
  /** Dims and blocks the whole group (e.g. draft order in an auction league). */
  disabled?: boolean;
  /** Opacity applied when the group is disabled. */
  disabledOpacity?: number;
  testIDPrefix?: string;
}

export function WizardChipGroup<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  disabledOpacity = 0.45,
  testIDPrefix,
}: WizardChipGroupProps<T>): React.JSX.Element {
  return (
    <XStack
      testID={testIDPrefix}
      flexWrap="wrap"
      gap={8}
      opacity={disabled ? disabledOpacity : 1}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const inert = disabled || option.disabled === true;
        const locked = option.locked === true && !selected;
        return (
          <XStack
            key={String(option.value)}
            testID={
              testIDPrefix
                ? `${testIDPrefix}-${String(option.value)}`
                : undefined
            }
            accessibilityRole="button"
            accessibilityLabel={option.label}
            aria-label={option.label}
            accessibilityState={{ disabled: inert, selected }}
            // A chip is a toggle button, so its selected state is aria-pressed —
            // aria-selected is not a supported attribute for role="button".
            aria-pressed={selected}
            aria-disabled={inert}
            onPress={() => !inert && onChange(option.value)}
            minWidth={WIZARD_TAP_TARGET}
            minHeight={WIZARD_TAP_TARGET}
            paddingVertical={11}
            paddingHorizontal={14}
            gap={6}
            alignItems="center"
            justifyContent="center"
            borderRadius={RADIUS_CHIP}
            borderWidth={selected ? 1.5 : 1}
            borderColor={selected ? BRAND_GOLD : PANEL_BORDER}
            backgroundColor={selected ? SURFACE_CARD : BG_DARK}
            opacity={option.disabled === true ? 0.4 : 1}
            cursor={inert ? 'default' : 'pointer'}
            pressStyle={inert ? undefined : { scale: 0.96 }}
          >
            {locked && <Lock size={10} color={BRAND_GOLD} />}
            <Text
              fontFamily="$body"
              fontSize={14}
              fontWeight={selected ? '800' : '700'}
              fontVariant={['tabular-nums']}
              color={
                option.disabled === true
                  ? TEXT_DISABLED
                  : selected
                    ? BRAND_GOLD_LIGHT
                    : TEXT_MUTED
              }
            >
              {option.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

// ── Text field ───────────────────────────────────────────────────────────────

export interface WizardTextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
  testID?: string;
}

export function WizardTextField({
  value,
  onChangeText,
  placeholder,
  disabled,
  invalid,
  keyboardType = 'default',
  maxLength,
  testID,
}: WizardTextFieldProps): React.JSX.Element {
  // `onChange` rather than `onChangeText` so the same component works against a
  // React Native TextInput (`nativeEvent.text`) and a DOM input (`target.value`)
  // — Tamagui's web Input passes `onChangeText` straight through to the DOM
  // element, where React drops it as an unknown handler.
  const handleChange = (event: TextInputChangeEvent) => {
    const domValue = (event as unknown as { target?: { value?: string } })
      .target?.value;
    const next = event.nativeEvent?.text ?? domValue;
    if (typeof next === 'string') onChangeText(next);
  };

  return (
    <Input
      testID={testID}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      keyboardType={keyboardType}
      maxLength={maxLength}
      minHeight={WIZARD_TAP_TARGET}
      paddingVertical={13}
      paddingHorizontal={16}
      fontSize={15}
      color={TEXT_PRIMARY}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderRadius={RADIUS_CHIP}
      borderColor={invalid === true ? INLINE_ERROR : PANEL_BORDER}
      focusStyle={{ borderColor: invalid === true ? INLINE_ERROR : BRAND_GOLD }}
      placeholderTextColor={TEXT_DISABLED}
    />
  );
}

// ── Toggle row ───────────────────────────────────────────────────────────────

export interface WizardToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

const SWITCH_WIDTH = 46;
const SWITCH_HEIGHT = 26;
const SWITCH_KNOB = 20;

export function WizardToggleRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
  testID,
}: WizardToggleRowProps): React.JSX.Element {
  return (
    <XStack
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={title}
      aria-label={title}
      accessibilityState={{ checked: value, disabled: disabled === true }}
      aria-checked={value}
      aria-disabled={disabled === true}
      onPress={() => disabled !== true && onChange(!value)}
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      minHeight={WIZARD_TAP_TARGET}
      paddingVertical={14}
      paddingHorizontal={16}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={RADIUS_CARD}
      opacity={disabled === true ? 0.5 : 1}
      cursor={disabled === true ? 'default' : 'pointer'}
      pressStyle={disabled === true ? undefined : { opacity: 0.85 }}
    >
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          fontFamily="$body"
          fontWeight="700"
          fontSize={14}
          color={TEXT_PRIMARY}
        >
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text fontFamily="$body" fontSize={12} color={TEXT_MUTED}>
            {subtitle}
          </Text>
        )}
      </YStack>

      <XStack
        width={SWITCH_WIDTH}
        height={SWITCH_HEIGHT}
        borderRadius={SWITCH_HEIGHT / 2}
        padding={3}
        flexShrink={0}
        alignItems="center"
        justifyContent={value ? 'flex-end' : 'flex-start'}
        backgroundColor={value ? withAlpha(BRAND_GOLD, 0.35) : PANEL_BORDER}
      >
        <YStack
          width={SWITCH_KNOB}
          height={SWITCH_KNOB}
          borderRadius={SWITCH_KNOB / 2}
          backgroundColor={value ? BRAND_GOLD : TEXT_TERTIARY}
        />
      </XStack>
    </XStack>
  );
}

// ── Conditional sub-card ─────────────────────────────────────────────────────

export interface WizardSubCardProps {
  label: string;
  testID?: string;
  children: React.ReactNode;
}

/** Panel that slides in under its trigger (auction settings, custom era, FAAB). */
export function WizardSubCard({
  label,
  testID,
  children,
}: WizardSubCardProps): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      gap={12}
      padding={14}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderLeftWidth={2}
      borderLeftColor={BRAND_GOLD}
      borderRadius={RADIUS_CARD}
    >
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={11}
        letterSpacing={1.2}
        color={BRAND_GOLD_LIGHT}
      >
        {label}
      </Text>
      {children}
    </YStack>
  );
}

// ── League limit banner ─────────────────────────────────────────────────────

export interface WizardLimitBannerProps {
  /** Free-tier league cap, e.g. `FREE_LEAGUE_LIMIT`. */
  limit: number;
  onUpgrade: () => void;
}

/**
 * Preflight warning shown the moment the wizard mounts when the user is
 * already at their free-tier league cap — before they spend time filling out
 * the form only to be blocked on final submit (LS-6133). Mirrors the web
 * "League limit reached" banner (`apps/web/src/pages/baseball/LeagueCreatePage.tsx`).
 */
export function WizardLimitBanner({
  limit,
  onUpgrade,
}: WizardLimitBannerProps): React.JSX.Element {
  return (
    <XStack
      testID="wizard-league-limit-banner"
      accessibilityRole="alert"
      gap={12}
      alignItems="flex-start"
      padding={14}
      backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.35)}
      borderRadius={RADIUS_CARD}
    >
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={12}
          letterSpacing={0.8}
          textTransform="uppercase"
          color={BRAND_GOLD_LIGHT}
        >
          League limit reached
        </Text>
        <Text fontFamily="$body" fontSize={13} color={TEXT_MUTED}>
          Free accounts can be in up to {limit} leagues. Upgrade to Legacy
          Commissioner for unlimited leagues.
        </Text>
      </YStack>
      <XStack
        testID="wizard-league-limit-upgrade"
        accessibilityRole="button"
        accessibilityLabel="Upgrade"
        aria-label="Upgrade"
        tabIndex={0}
        onPress={onUpgrade}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onUpgrade();
          }
        }}
        minHeight={WIZARD_TAP_TARGET}
        paddingHorizontal={14}
        alignItems="center"
        justifyContent="center"
        borderRadius={RADIUS_CHIP}
        backgroundColor={BRAND_GOLD}
        cursor="pointer"
        pressStyle={{ scale: 0.97 }}
      >
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={12}
          letterSpacing={0.6}
          color={BG_DARK}
        >
          Upgrade
        </Text>
      </XStack>
    </XStack>
  );
}

// ── Bottom bar ───────────────────────────────────────────────────────────────

/**
 * BACK + NEXT for steps 1–4. The review step renders `WizardPrimaryCta`
 * instead, so this bar always has both actions.
 */
export interface WizardBottomBarProps {
  /** "CANCEL" on step 1, "BACK" thereafter. */
  backLabel: string;
  onBack: () => void;
  nextLabel: string;
  onNext: () => void;
  nextDisabled?: boolean;
}

export function WizardBottomBar({
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextDisabled = false,
}: WizardBottomBarProps): React.JSX.Element {
  return (
    <YStack paddingHorizontal={20} paddingTop={8} paddingBottom={24}>
      <XStack gap={12}>
        <XStack
          testID="wizard-back"
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          aria-label={backLabel}
          onPress={onBack}
          flex={1}
          minHeight={WIZARD_TAP_TARGET}
          alignItems="center"
          justifyContent="center"
          borderWidth={1}
          borderColor={OUTLINE_STRONG}
          borderRadius={RADIUS_CARD}
          cursor="pointer"
          pressStyle={{ opacity: 0.7 }}
        >
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={14}
            letterSpacing={1.5}
            color={TEXT_PRIMARY}
          >
            {backLabel}
          </Text>
        </XStack>

        <XStack
          testID="wizard-next"
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          aria-label={nextLabel}
          accessibilityState={{ disabled: nextDisabled }}
          aria-disabled={nextDisabled}
          onPress={() => !nextDisabled && onNext()}
          flex={2}
          minHeight={WIZARD_TAP_TARGET}
          alignItems="center"
          justifyContent="center"
          borderRadius={RADIUS_CARD}
          backgroundColor={BRAND_GOLD}
          opacity={nextDisabled ? 0.45 : 1}
          cursor={nextDisabled ? 'default' : 'pointer'}
          pressStyle={nextDisabled ? undefined : { scale: 0.98 }}
        >
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={14}
            letterSpacing={1.5}
            color={BG_DARK}
          >
            {nextLabel}
          </Text>
        </XStack>
      </XStack>
    </YStack>
  );
}

/** Full-width gold CTA used by the review step in place of BACK + NEXT. */
export interface WizardPrimaryCtaProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  helperText?: string;
  testID?: string;
}

export function WizardPrimaryCta({
  label,
  onPress,
  disabled = false,
  helperText,
  testID = 'wizard-submit',
}: WizardPrimaryCtaProps): React.JSX.Element {
  return (
    <YStack gap={10}>
      <XStack
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-label={label}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        onPress={() => !disabled && onPress()}
        minHeight={WIZARD_TAP_TARGET}
        alignItems="center"
        justifyContent="center"
        borderRadius={RADIUS_CARD}
        backgroundColor={BRAND_GOLD}
        opacity={disabled ? 0.45 : 1}
        cursor={disabled ? 'default' : 'pointer'}
        pressStyle={disabled ? undefined : { scale: 0.98 }}
      >
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={14}
          letterSpacing={1.5}
          color={BG_DARK}
        >
          {label}
        </Text>
      </XStack>
      {helperText !== undefined && (
        <Text
          fontFamily="$body"
          fontSize={12}
          color={TEXT_TERTIARY}
          textAlign="center"
        >
          {helperText}
        </Text>
      )}
    </YStack>
  );
}

// ── Review summary card ──────────────────────────────────────────────────────

export interface WizardSummaryCardProps {
  title: string;
  onEdit: () => void;
  testID?: string;
  children: React.ReactNode;
}

export function WizardSummaryCard({
  title,
  onEdit,
  testID,
  children,
}: WizardSummaryCardProps): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      borderWidth={1}
      borderColor={PANEL_BORDER}
      borderRadius={RADIUS_CARD}
      overflow="hidden"
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingVertical={10}
        paddingHorizontal={14}
        backgroundColor={SURFACE_CARD}
      >
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={11}
          letterSpacing={1.2}
          color={BRAND_GOLD_LIGHT}
        >
          {title}
        </Text>
        <XStack
          testID={testID ? `${testID}-edit` : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title}`}
          aria-label={`Edit ${title}`}
          onPress={onEdit}
          minWidth={WIZARD_TAP_TARGET}
          minHeight={WIZARD_TAP_TARGET}
          marginVertical={-10}
          alignItems="center"
          justifyContent="flex-end"
          cursor="pointer"
          pressStyle={{ opacity: 0.6 }}
        >
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={12}
            color={BRAND_GOLD_LIGHT}
          >
            Edit
          </Text>
        </XStack>
      </XStack>
      <YStack paddingHorizontal={14} paddingVertical={4}>
        {children}
      </YStack>
    </YStack>
  );
}

export interface WizardSummaryRowProps {
  label: string;
  value: string;
  /** Renders a PREMIUM chip before the value (premium feature left off). */
  premiumLocked?: boolean;
}

export function WizardSummaryRow({
  label,
  value,
  premiumLocked = false,
}: WizardSummaryRowProps): React.JSX.Element {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingVertical={9}
      borderBottomWidth={1}
      borderBottomColor={SUMMARY_HAIRLINE}
    >
      <Text fontFamily="$body" fontSize={13} color={TEXT_MUTED} flexShrink={1}>
        {label}
      </Text>
      <XStack alignItems="center" gap={6} flexShrink={0}>
        {premiumLocked && (
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={9}
            letterSpacing={0.6}
            color={BG_DARK}
            backgroundColor={BRAND_GOLD}
            borderRadius={4}
            paddingVertical={2}
            paddingHorizontal={6}
          >
            PREMIUM
          </Text>
        )}
        <Text
          fontFamily="$body"
          fontWeight="700"
          fontSize={13}
          fontVariant={['tabular-nums']}
          color={premiumLocked ? TEXT_TERTIARY : TEXT_PRIMARY}
          textAlign="right"
        >
          {value}
        </Text>
      </XStack>
    </XStack>
  );
}
