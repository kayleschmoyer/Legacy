import React from 'react';
import {
  Button,
  Dialog,
  H2,
  Input,
  Paragraph,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';
import { SalaryCapField } from '../leagues/premium/SalaryCapField';
import {
  FaabBudgetField,
  WaiverSystemField,
} from '../leagues/premium/WaiverFields';
import { OptionButtonGroup } from '../leagues/premium/_controls';
import {
  FAAB_BUDGET_OPTIONS,
  type WaiverType,
} from '../leagues/premium/constants';

/** Default number of teams pre-selected in the quick-create dialog. */
export const DEFAULT_NUM_TEAMS = 12;
/** Default number of divisions pre-selected in the quick-create dialog. */
export const DEFAULT_NUM_DIVISIONS = 2;
/** Maximum allowed league-name length. */
export const MAX_LEAGUE_NAME_LENGTH = 50;

export type PlayerPool = 'all' | 'nl' | 'al';
export type DraftMode = 'live' | 'automated';
export type SelectionMethod = 'standard' | 'auction' | 'random';
export type DraftOrder = 'snake' | 'linear';

export type PlayoffFormat = '4-team' | '6-team' | '8-team';

/**
 * Platform-agnostic payload emitted when the user submits the quick-create
 * dialog. The consuming wrapper maps this onto its own GraphQL mutation input,
 * keeping this dialog free of any data-fetching dependency (LS-7716).
 */
export interface QuickCreateLeagueInput {
  leagueName: string;
  numberOfTeams: number;
  numberOfDivisions: number;
  playerPool: PlayerPool;
  draftMode: DraftMode;
  selectionMethod: SelectionMethod;
  draftOrder: DraftOrder;
  maxRosterSize: number;
  isPublic: boolean;
  // Premium fields — present when the dialog is rendered in premium-aware mode
  waiverType?: WaiverType;
  faabBudget?: number;
  salaryCapEnabled?: boolean;
  salaryCapAmount?: number;
  playoffFormat?: PlayoffFormat;
}

export interface CreateLeagueDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog requests to open/close. */
  onOpenChange: (open: boolean) => void;
  /**
   * Performs the create. Resolving closes the dialog; rejecting (throwing)
   * surfaces the error message inline and keeps the dialog open so the user can
   * retry without re-entering their settings.
   */
  onSubmit: (input: QuickCreateLeagueInput) => Promise<void>;
  /**
   * External submitting indicator (e.g. a mutation's `loading` flag). Combined
   * with the dialog's own in-flight state to disable inputs.
   */
  submitting?: boolean;
  /**
   * Optional handler for the "Advanced settings" link. When provided, the link
   * is shown and receives the currently-typed league name so the full create
   * flow can pre-fill it. When omitted, the link is hidden.
   */
  onAdvanced?: (leagueName: string) => void;
  /**
   * When provided, the premium-feature section (salary cap, waiver/FAAB,
   * playoff format) is rendered. True = user can enable them; false = controls
   * show but route taps to `onUpgrade`.
   */
  isPremium?: boolean;
  /**
   * Called when a non-premium viewer tries to enable a premium-gated feature.
   * Required when `isPremium` is supplied.
   */
  onUpgrade?: () => void;
}

interface OptionButtonProps<T> {
  value: T;
  label: string;
  selected: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  flex?: number;
  onPress: (value: T) => void;
}

function OptionButton<T>({
  value,
  label,
  selected,
  disabled = false,
  accessibilityLabel,
  flex,
  onPress,
}: OptionButtonProps<T>) {
  return (
    <Button
      size="$2"
      flex={flex}
      disabled={disabled}
      opacity={disabled ? 0.4 : 1}
      backgroundColor={selected ? BRAND_NAVY_LIGHT : '$color2'}
      borderColor={selected ? BRAND_NAVY_LIGHT : '$borderColor'}
      borderWidth={selected ? 2 : 1}
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      onPress={() => onPress(value)}
    >
      <Text fontSize="$2" color={selected ? BRAND_GOLD : '$color'}>
        {label}
      </Text>
    </Button>
  );
}

/**
 * Shared, data-free quick-create league dialog (LS-7716).
 *
 * Extracted from the web `BaseballLandingPage` so both web and mobile present
 * an identical create experience. It owns only local UI state (form fields,
 * inline error); the actual league creation is delegated to `onSubmit`.
 */
export function CreateLeagueDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting = false,
  onAdvanced,
  isPremium,
  onUpgrade,
}: CreateLeagueDialogProps) {
  const [leagueName, setLeagueName] = React.useState('');
  const [teamCount, setTeamCount] = React.useState<number>(DEFAULT_NUM_TEAMS);
  const [playerPool, setPlayerPool] = React.useState<PlayerPool>('all');
  const [draftMode, setDraftMode] = React.useState<DraftMode>('live');
  const [selectionMethod, setSelectionMethod] =
    React.useState<SelectionMethod>('standard');
  const [draftOrder, setDraftOrder] = React.useState<DraftOrder>('snake');
  const [maxRosterSize, setMaxRosterSize] = React.useState<number>(25);
  const [numberOfDivisions, setNumberOfDivisions] = React.useState<number>(
    DEFAULT_NUM_DIVISIONS,
  );
  const [isPublic, setIsPublic] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Premium fields — only included in the payload when onUpgrade is provided
  const showPremiumSection = onUpgrade !== undefined;
  const [waiverType, setWaiverType] = React.useState<WaiverType>('standard');
  const [faabBudget, setFaabBudget] = React.useState<number>(
    FAAB_BUDGET_OPTIONS[1],
  );
  const [salaryCapEnabled, setSalaryCapEnabled] = React.useState(false);
  const [salaryCapAmount, setSalaryCapAmount] = React.useState<
    number | undefined
  >(undefined);
  const [playoffFormat, setPlayoffFormat] =
    React.useState<PlayoffFormat>('4-team');

  const busy = submitting || pending;
  const trimmedName = leagueName.trim();
  const nameValid =
    trimmedName.length >= 3 && trimmedName.length <= MAX_LEAGUE_NAME_LENGTH;

  const resetForm = React.useCallback(() => {
    setLeagueName('');
    setTeamCount(DEFAULT_NUM_TEAMS);
    setPlayerPool('all');
    setDraftMode('live');
    setSelectionMethod('standard');
    setDraftOrder('snake');
    setMaxRosterSize(25);
    setNumberOfDivisions(DEFAULT_NUM_DIVISIONS);
    setIsPublic(false);
    setCreateError(null);
    setWaiverType('standard');
    setFaabBudget(FAAB_BUDGET_OPTIONS[1]);
    setSalaryCapEnabled(false);
    setSalaryCapAmount(undefined);
    setPlayoffFormat('4-team');
  }, []);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      resetForm();
    }
  };

  const handleSubmit = () => {
    if (busy || !nameValid) return;
    setCreateError(null);
    setPending(true);
    onSubmit({
      leagueName: trimmedName,
      numberOfTeams: teamCount,
      numberOfDivisions,
      playerPool,
      draftMode,
      selectionMethod,
      draftOrder,
      maxRosterSize,
      isPublic,
      ...(showPremiumSection && {
        waiverType,
        faabBudget: waiverType === 'faab' ? faabBudget : undefined,
        salaryCapEnabled,
        salaryCapAmount: salaryCapEnabled ? salaryCapAmount : undefined,
        playoffFormat,
      }),
    })
      .then(() => {
        setPending(false);
        handleOpenChange(false);
      })
      .catch((err: unknown) => {
        setPending(false);
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to create league. Please try again.';
        setCreateError(msg);
      });
  };

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          backgroundColor={withAlpha('#000000', 0.65)}
        />
        <Dialog.Content
          key="content"
          bordered
          elevate
          animation="quick"
          enterStyle={{ opacity: 0, scale: 0.97 }}
          maxWidth={560}
          width="100%"
          maxHeight="90%"
          padding="$5"
          gap="$3"
          backgroundColor="$color2"
          borderColor={withAlpha(BRAND_NAVY, 0.28)}
          borderRadius="$7"
          aria-labelledby="create-league-title"
          aria-describedby="create-league-desc"
        >
          <YStack>
            <H2 fontSize="$6" id="create-league-title">
              Create League
            </H2>
            <Paragraph color="$gray11" id="create-league-desc">
              Configure your league settings before inviting managers to join.
            </Paragraph>
          </YStack>

          <YStack
            opacity={busy ? 0.5 : 1}
            pointerEvents={busy ? 'none' : 'auto'}
            gap="$3"
          >
            {/* League Name */}
            <YStack gap="$1.5">
              <Text fontWeight="600" fontSize="$3" color="$gray12">
                League Name
              </Text>
              <Input
                placeholder="e.g., Saturday Sluggers"
                value={leagueName}
                onChangeText={setLeagueName}
                onSubmitEditing={handleSubmit}
                maxLength={MAX_LEAGUE_NAME_LENGTH}
                size="$3"
                accessibilityLabel="League name"
                aria-label="League name"
              />
            </YStack>

            {/* Number of Teams */}
            <YStack gap="$1.5">
              <Text fontWeight="600" fontSize="$3" color="$gray12">
                Number of Teams
              </Text>
              <XStack gap="$1.5" flexWrap="wrap">
                {[4, 6, 8, 10, 12, 14, 16].map((n) => (
                  <OptionButton
                    key={n}
                    value={n}
                    label={String(n)}
                    selected={teamCount === n}
                    accessibilityLabel={`Select ${n} teams`}
                    onPress={setTeamCount}
                  />
                ))}
              </XStack>
            </YStack>

            {/* Divisions + Player Pool */}
            <XStack gap="$3">
              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Divisions
                </Text>
                <XStack gap="$1.5" flexWrap="wrap">
                  {[1, 2, 3, 4].map((n) => (
                    <OptionButton
                      key={n}
                      value={n}
                      label={String(n)}
                      selected={numberOfDivisions === n}
                      accessibilityLabel={`${n} division${n === 1 ? '' : 's'}`}
                      onPress={setNumberOfDivisions}
                    />
                  ))}
                </XStack>
              </YStack>

              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Player Pool
                </Text>
                <XStack gap="$1.5" flexWrap="wrap">
                  {(
                    [
                      ['all', 'All MLB'],
                      ['nl', 'NL'],
                      ['al', 'AL'],
                    ] as const
                  ).map(([val, label]) => (
                    <OptionButton
                      key={val}
                      value={val}
                      label={label}
                      selected={playerPool === val}
                      accessibilityLabel={`Player pool: ${label}`}
                      onPress={setPlayerPool}
                    />
                  ))}
                </XStack>
              </YStack>
            </XStack>

            {/* Draft Mode + Selection Method */}
            <XStack gap="$3">
              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Draft Mode
                </Text>
                <XStack gap="$1.5">
                  {(
                    [
                      ['live', 'Live'],
                      ['automated', 'Auto'],
                    ] as const
                  ).map(([val, label]) => (
                    <OptionButton
                      key={val}
                      value={val}
                      label={label}
                      selected={draftMode === val}
                      accessibilityLabel={`Draft mode: ${label}`}
                      onPress={(v) => {
                        setDraftMode(v);
                        if (v === 'automated') setSelectionMethod('random');
                      }}
                    />
                  ))}
                </XStack>
              </YStack>

              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Selection Method
                </Text>
                <XStack gap="$1.5" flexWrap="wrap">
                  {(
                    [
                      ['standard', 'Standard'],
                      ['auction', 'Auction'],
                      ['random', 'Random'],
                    ] as const
                  ).map(([val, label]) => (
                    <OptionButton
                      key={val}
                      value={val}
                      label={label}
                      selected={selectionMethod === val}
                      disabled={draftMode === 'automated' && val !== 'random'}
                      accessibilityLabel={`Selection method: ${label}`}
                      onPress={setSelectionMethod}
                    />
                  ))}
                </XStack>
              </YStack>
            </XStack>

            {/* Draft Order + Max Roster Size */}
            <XStack gap="$3">
              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Draft Order
                </Text>
                <XStack gap="$1.5">
                  {(
                    [
                      ['snake', 'Snake'],
                      ['linear', 'Linear'],
                    ] as const
                  ).map(([val, label]) => (
                    <OptionButton
                      key={val}
                      value={val}
                      label={label}
                      selected={draftOrder === val}
                      accessibilityLabel={`Draft order: ${label}`}
                      onPress={setDraftOrder}
                    />
                  ))}
                </XStack>
              </YStack>

              <YStack gap="$1.5" flex={1}>
                <Text fontWeight="600" fontSize="$3" color="$gray12">
                  Max Roster Size
                </Text>
                <XStack gap="$1.5" flexWrap="wrap">
                  {[20, 22, 25, 30, 35, 40].map((n) => (
                    <OptionButton
                      key={n}
                      value={n}
                      label={String(n)}
                      selected={maxRosterSize === n}
                      accessibilityLabel={`Max roster size: ${n}`}
                      onPress={setMaxRosterSize}
                    />
                  ))}
                </XStack>
              </YStack>
            </XStack>

            {/* League Visibility */}
            <YStack gap="$1.5">
              <Text fontWeight="600" fontSize="$3" color="$gray12">
                League Visibility
              </Text>
              <XStack gap="$1.5">
                <OptionButton
                  value={false}
                  label="Private"
                  selected={!isPublic}
                  flex={1}
                  accessibilityLabel="Private league"
                  onPress={() => setIsPublic(false)}
                />
                <OptionButton
                  value={true}
                  label="Public"
                  selected={isPublic}
                  flex={1}
                  accessibilityLabel="Public league"
                  onPress={() => setIsPublic(true)}
                />
              </XStack>
              <Text fontSize="$1" color="$gray10">
                {isPublic
                  ? 'Anyone can browse and join this league without an invite code'
                  : 'Only people with your invite code can join this league'}
              </Text>
            </YStack>

            {/* Premium features — shown when the consumer provides onUpgrade */}
            {showPremiumSection && onUpgrade && (
              <YStack gap="$3" marginTop="$1">
                <Separator />
                <Text
                  fontWeight="700"
                  fontSize="$2"
                  color={BRAND_GOLD}
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  Premium Settings
                </Text>

                <WaiverSystemField
                  value={waiverType}
                  onChange={setWaiverType}
                  isPremium={isPremium ?? false}
                  disabled={busy}
                  onUpgrade={onUpgrade}
                />

                {waiverType === 'faab' && (
                  <FaabBudgetField
                    value={faabBudget}
                    onChange={setFaabBudget}
                    disabled={busy}
                  />
                )}

                <SalaryCapField
                  enabled={salaryCapEnabled}
                  amount={salaryCapAmount}
                  onToggleEnabled={setSalaryCapEnabled}
                  onAmountChange={setSalaryCapAmount}
                  isPremium={isPremium ?? false}
                  disabled={busy}
                  onUpgrade={onUpgrade}
                />

                <YStack gap="$2">
                  <Text fontWeight="600" fontSize="$3" color="$gray12">
                    Playoff Format
                  </Text>
                  <OptionButtonGroup<PlayoffFormat>
                    value={playoffFormat}
                    testIDPrefix="create-league-playoff-format"
                    options={[
                      { value: '4-team', label: '4-Team' },
                      {
                        value: '6-team',
                        label: '6-Team  ·  Premium',
                        locked: !isPremium,
                      },
                      {
                        value: '8-team',
                        label: '8-Team  ·  Premium',
                        locked: !isPremium,
                      },
                    ]}
                    onChange={(v) => {
                      if ((v === '6-team' || v === '8-team') && !isPremium) {
                        onUpgrade();
                        return;
                      }
                      setPlayoffFormat(v);
                    }}
                    disabled={busy}
                    wide
                  />
                </YStack>
              </YStack>
            )}
          </YStack>

          <Separator />

          {createError ? (
            <XStack
              backgroundColor="$red3"
              borderColor="$red6"
              borderWidth={1}
              borderRadius="$3"
              padding="$2"
              gap="$2"
              alignItems="center"
              role="alert"
            >
              <AlertTriangle size={14} color="$red10" />
              <Text fontSize="$2" color="$red10" flex={1}>
                {createError}
              </Text>
            </XStack>
          ) : null}

          <XStack justifyContent="space-between" alignItems="center" gap="$3">
            {onAdvanced ? (
              <Text
                fontSize="$2"
                color={BRAND_GOLD_LIGHT}
                cursor="pointer"
                textDecorationLine="underline"
                accessibilityLabel="Open advanced league settings"
                aria-label="Open advanced league settings"
                onPress={() => {
                  handleOpenChange(false);
                  onAdvanced(trimmedName);
                }}
              >
                Advanced settings →
              </Text>
            ) : (
              <YStack />
            )}
            <XStack gap="$3">
              <Dialog.Close asChild>
                <Button
                  disabled={busy}
                  backgroundColor={withAlpha(BRAND_NAVY, 0.12)}
                  borderColor={withAlpha(BRAND_NAVY, 0.42)}
                  borderWidth={1}
                >
                  <Text color={BRAND_GOLD_LIGHT} fontWeight="700">
                    Cancel
                  </Text>
                </Button>
              </Dialog.Close>
              <Button
                disabled={busy || !nameValid}
                backgroundColor={BRAND_NAVY_LIGHT}
                onPress={handleSubmit}
                accessibilityLabel="Create League"
                aria-label="Create League"
              >
                <Text color="$color1" fontWeight="700">
                  {busy ? 'Creating…' : 'Create League'}
                </Text>
              </Button>
            </XStack>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export default CreateLeagueDialog;
