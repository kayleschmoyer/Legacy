import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  RotateCcw,
  Save,
  Settings2,
  Zap,
} from '@tamagui/lucide-icons';
import { AnimatePresence, Input, Text } from 'tamagui';
import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
  useUpdateLeagueScoringProfileMutation,
} from '../../api/db/graphql.generated';
import {
  BLACK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  GRADIENT_BUTTON_PRIMARY,
  GREEN,
  INDIGO,
  ORANGE,
  withAlpha,
} from '../../constants/colors';

/* ── Gradient accent per group ────────────────────────────────────────────── */
const GROUP_COPY: Record<
  ScoringStatGroup,
  {
    title: string;
    description: string;
    accent: string;
    gradientFrom: string;
    gradientTo: string;
  }
> = {
  [ScoringStatGroup.Batting]: {
    title: 'Batting',
    description: 'Home runs, RBIs, steals, and more.',
    accent: BRAND_NAVY_LIGHT,
    gradientFrom: withAlpha(BRAND_NAVY_LIGHT, 0.18),
    gradientTo: 'transparent',
  },
  [ScoringStatGroup.Pitching]: {
    title: 'Pitching',
    description: 'Wins, strikeouts, saves, and ERA impact.',
    accent: '$green9',
    gradientFrom: withAlpha(GREEN, 0.18),
    gradientTo: 'transparent',
  },
  [ScoringStatGroup.Fielding]: {
    title: 'Fielding',
    description: 'Fielding bonuses and errors.',
    accent: '$orange9',
    gradientFrom: withAlpha(ORANGE, 0.18),
    gradientTo: 'transparent',
  },
};

const GROUP_ORDER: readonly ScoringStatGroup[] = [
  ScoringStatGroup.Batting,
  ScoringStatGroup.Pitching,
  ScoringStatGroup.Fielding,
];

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

interface ProfileStat {
  id: number;
  group: ScoringStatGroup;
  displayName: string;
  description: string | null | undefined;
  multiplier: number;
  defaultMultiplier: number;
  enforcePositive: boolean;
  enforceNegative: boolean;
  minMultiplier: number | null | undefined;
  maxMultiplier: number | null | undefined;
}

type FieldErrorState = Record<number, string | null>;

type FormValueState = Record<number, string>;

interface LeagueScoringEditorProps {
  leagueId: number;
  profile: LeagueScoringProfile | null | undefined;
  loading: boolean;
  error?: Error | null;
  onRefetch: () => Promise<void>;
  draftStatus?: string | null;
}

function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function parseInput(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateStat(
  stat: ProfileStat,
  value: string | undefined,
): string | null {
  const parsed = parseInput(value);

  if (parsed === null) {
    return 'Enter a number to apply an override';
  }

  if (stat.enforcePositive && parsed <= 0) {
    return 'Value must be greater than zero';
  }

  if (stat.enforceNegative && parsed >= 0) {
    return 'Value must be less than zero';
  }

  const min =
    typeof stat.minMultiplier === 'number' ? stat.minMultiplier : null;
  const max =
    typeof stat.maxMultiplier === 'number' ? stat.maxMultiplier : null;

  if (min !== null && !(stat.defaultMultiplier < min) && parsed < min) {
    return `Must be >= ${min}`;
  }

  if (max !== null && !(stat.defaultMultiplier > max) && parsed > max) {
    return `Must be <= ${max}`;
  }

  return null;
}

function collectProfileStats(
  profile: LeagueScoringProfile | null | undefined,
): ProfileStat[] {
  if (!profile?.stats) {
    return [];
  }

  const stats: ProfileStat[] = [];
  const statsList = profile.stats;

  for (const raw of statsList) {
    if (!raw || !raw.definition) {
      continue;
    }

    const { definition } = raw;

    if (definition.id == null || definition.statGroup == null) {
      continue;
    }

    const displayName = definition.displayName ?? `Stat ${definition.id}`;
    const defaultMultiplier =
      typeof definition.defaultMultiplier === 'number'
        ? definition.defaultMultiplier
        : typeof raw.defaultMultiplier === 'number'
          ? raw.defaultMultiplier
          : typeof raw.multiplier === 'number'
            ? raw.multiplier
            : 0;
    const multiplier =
      typeof raw.multiplier === 'number' ? raw.multiplier : defaultMultiplier;

    stats.push({
      id: definition.id,
      group: definition.statGroup,
      displayName,
      description: definition.description,
      multiplier,
      defaultMultiplier,
      enforcePositive: Boolean(definition.enforcePositive),
      enforceNegative: Boolean(definition.enforceNegative),
      minMultiplier:
        typeof definition.minMultiplier === 'number'
          ? definition.minMultiplier
          : null,
      maxMultiplier:
        typeof definition.maxMultiplier === 'number'
          ? definition.maxMultiplier
          : null,
    });
  }

  return stats;
}

function createInitialValues(stats: ProfileStat[]): FormValueState {
  return stats.reduce<FormValueState>((acc, stat) => {
    acc[stat.id] = formatMultiplier(stat.multiplier);
    return acc;
  }, {});
}

function createInitialErrors(stats: ProfileStat[]): FieldErrorState {
  const next: FieldErrorState = {};

  for (const stat of stats) {
    next[stat.id] = null;
  }

  return next;
}

function valuesToUpdates(
  stats: ProfileStat[],
  values: FormValueState,
  baselineMultipliers?: Record<number, number>,
) {
  return stats
    .map((stat) => {
      const value = values[stat.id];
      const parsed = parseInput(value);

      if (parsed === null) {
        return null;
      }

      const baseline = baselineMultipliers?.[stat.id] ?? stat.multiplier;
      const isChanged = Math.abs(parsed - baseline) > 0.0001;

      if (!isChanged) {
        return null;
      }

      return {
        statDefinitionId: stat.id,
        multiplier: Number(parsed.toFixed(4)),
      };
    })
    .filter(
      (
        update,
      ): update is {
        statDefinitionId: number;
        multiplier: number;
      } => Boolean(update),
    );
}

export function LeagueScoringEditor(
  props: LeagueScoringEditorProps,
): React.JSX.Element {
  const { leagueId, profile, loading, error, onRefetch, draftStatus } = props;

  const stats = useMemo(() => collectProfileStats(profile), [profile]);
  const groupedStats = useMemo(() => {
    const groups: Record<ScoringStatGroup, ProfileStat[]> = {
      [ScoringStatGroup.Batting]: [],
      [ScoringStatGroup.Pitching]: [],
      [ScoringStatGroup.Fielding]: [],
    };

    for (const stat of stats) {
      const groupKey = stat.group;

      if (!GROUP_ORDER.includes(groupKey)) {
        continue;
      }

      groups[groupKey].push(stat);
    }

    for (const group of GROUP_ORDER) {
      groups[group].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    return groups;
  }, [stats]);

  const [formValues, setFormValues] = useState<FormValueState>(() =>
    createInitialValues(stats),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>(() =>
    createInitialErrors(stats),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Server-confirmed multiplier per stat, used for dirty-checking. Updated from
  // props when stats change AND optimistically from the save payload on
  // successful mutation. This ensures the "unsaved" badge clears immediately
  // after save without waiting for the async refetch → parent re-render →
  // stats-update pipeline.
  const [baselineMultipliers, setBaselineMultipliers] = useState<
    Record<number, number>
  >(() => Object.fromEntries(stats.map((s) => [s.id, s.multiplier])));

  const [updateScoring, { loading: saving }] =
    useUpdateLeagueScoringProfileMutation();

  // Guard against the stats-sync effect overwriting optimistic baseline/form
  // state mid-save. When onRefetch() is in flight, cache-and-network emits an
  // intermediate render with the stale Apollo cache before the fresh network
  // response arrives. If the effect fires during that stale-cache render, it
  // would reset formValues to the old multiplier while baseline still holds the
  // optimistically-updated new value → pendingUpdates > 0 → badge reappears.
  // Guarding both setters preserves the optimistic state until isSavingRef is
  // cleared, after which the effect runs with fresh server data.
  const isSavingRef = useRef(false);

  // Tracks whether a stats-sync was skipped because a save was in flight.
  // If true, the finally block re-applies the latest stats once isSavingRef is
  // cleared so that baseline/formValues always reflect fresh server data after
  // a save completes.
  const skippedSyncRef = useRef(false);

  // Always-current snapshot of `stats` for use inside async closures (e.g. the
  // handleSave finally block). Because handleSave is an async function, the
  // `stats` variable it closes over is the value from the render in which it
  // was defined. If Apollo triggers intermediate renders while the mutation /
  // refetch are in flight (cache-and-network), `stats` in the closure becomes
  // stale. Reading statsRef.current instead always gets the latest value.
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    // During a save, the optimistic baseline and the user's entered form values
    // are the source of truth. Skip both resync operations so that a
    // cache-and-network stale-cache intermediate render cannot re-dirty the
    // form while the mutation / refetch are still in flight. Record the skip so
    // the finally block can replay the sync once saving is done.
    if (isSavingRef.current) {
      skippedSyncRef.current = true;
    } else {
      setBaselineMultipliers(
        Object.fromEntries(stats.map((s) => [s.id, s.multiplier])),
      );
      setFormValues(createInitialValues(stats));
    }
    setFieldErrors(createInitialErrors(stats));
    setSaveError(null);
    // NOTE: setSaveSuccess(false) is intentionally NOT called here.
    // The finally block in handleSave clears isSavingRef.current synchronously
    // before React processes the pending state updates, so by the time this
    // effect runs, isSavingRef is already false — making it impossible to
    // distinguish "stats changed from the save's own refetch" from an external
    // update. Calling setSaveSuccess(false) unconditionally would race with the
    // setSaveSuccess(true) in handleSave: both end up in the same React batch,
    // and the effect then immediately clears the toast before Playwright (or the
    // user) can see it (LS-4315).
    // All explicit user actions (handleValueChange, handleResetStat,
    // handleResetAll) and the save error path already call setSaveSuccess(false)
    // directly, so no paths leave a stale "success" banner after user interaction.
  }, [stats]);

  const statById = useMemo(() => {
    const map = new Map<number, ProfileStat>();

    for (const stat of stats) {
      map.set(stat.id, stat);
    }

    return map;
  }, [stats]);

  const hasValidationErrors = useMemo(
    () => Object.values(fieldErrors).some((value) => Boolean(value)),
    [fieldErrors],
  );

  const pendingUpdates = useMemo(
    () => valuesToUpdates(stats, formValues, baselineMultipliers),
    [stats, formValues, baselineMultipliers],
  );

  const isLocked = draftStatus === 'completed';
  const canSave =
    !isLocked &&
    !loading &&
    !saving &&
    !hasValidationErrors &&
    pendingUpdates.length > 0;

  const handleValueChange = (statId: number, nextValue: string) => {
    setFormValues((prev) => ({ ...prev, [statId]: nextValue }));

    const stat = statById.get(statId);

    if (stat) {
      const nextError = validateStat(stat, nextValue);
      setFieldErrors((prev) => ({ ...prev, [statId]: nextError }));
    }

    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleResetStat = (statId: number) => {
    const stat = statById.get(statId);

    if (!stat) {
      return;
    }

    const resetValue = formatMultiplier(stat.defaultMultiplier);

    setFormValues((prev) => ({ ...prev, [statId]: resetValue }));
    setFieldErrors((prev) => ({ ...prev, [statId]: null }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleResetAll = () => {
    const nextValues: FormValueState = {};

    for (const stat of stats) {
      nextValues[stat.id] = formatMultiplier(stat.defaultMultiplier);
    }

    setFormValues(nextValues);
    setFieldErrors(createInitialErrors(stats));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    // Validate every field before saving. handleValueChange only runs validation
    // on user input, so fields that started blank (e.g. a stat whose server-side
    // multiplier is non-finite) never have their errors set. Without this guard,
    // valuesToUpdates silently drops those fields from the save payload.
    const freshErrors: FieldErrorState = {};
    let hasAnyError = false;
    for (const stat of stats) {
      const err = validateStat(stat, formValues[stat.id]);
      freshErrors[stat.id] = err;
      if (err !== null) hasAnyError = true;
    }
    if (hasAnyError) {
      setFieldErrors(freshErrors);
      return;
    }

    // Snapshot the updates, current baseline, and current form values before the
    // async gap — state may change mid-flight and we need them for rollback on
    // error so the user's edits are fully restored.
    const updatesToSave = pendingUpdates;
    const previousBaseline = baselineMultipliers;
    const previousFormValues = formValues;

    // Prevent the stats-sync effect from overwriting our optimistic state
    // while the mutation / refetch are in flight (see isSavingRef comment).
    isSavingRef.current = true;

    // Optimistically update baseline and form values BEFORE the mutation so the
    // "unsaved" badge clears immediately when save is initiated rather than
    // waiting for the full mutation + refetch round-trip. This eliminates the
    // >20s badge-visible window seen in slow CI environments.
    setBaselineMultipliers((prev) => {
      const next = { ...prev };
      for (const update of updatesToSave) {
        next[update.statDefinitionId] = update.multiplier;
      }
      return next;
    });
    setFormValues((prev) => {
      const next = { ...prev };
      for (const update of updatesToSave) {
        next[update.statDefinitionId] = formatMultiplier(update.multiplier);
      }
      return next;
    });

    try {
      await updateScoring({
        variables: {
          leagueId,
          updates: updatesToSave,
        },
      });

      await onRefetch();

      setSaveSuccess(true);
      setSaveError(null);
    } catch (mutationError) {
      // Rollback both the baseline and formValues to their pre-save snapshots so
      // the "unsaved" badge reappears and the form is fully restored to the
      // user's entered values — retryable without losing any edits.
      setBaselineMultipliers(previousBaseline);
      setFormValues(previousFormValues);
      setSaveSuccess(false);
      setSaveError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to update scoring multipliers',
      );
    } finally {
      isSavingRef.current = false;

      // If stats changed while saving was in flight (e.g. the refetch resolved
      // and triggered the useEffect while isSavingRef was true), replay the sync
      // now that the guard is cleared so baseline/formValues reflect fresh
      // server data.
      //
      // IMPORTANT: use statsRef.current (always-fresh) rather than the `stats`
      // closure variable, which is stale — it was captured at the render when
      // handleSave was defined and does NOT reflect Apollo renders that occurred
      // during the async mutation / refetch gap. Using stale stats here would
      // reset baseline/formValues to the pre-save multiplier, potentially
      // causing a mismatch that re-introduces pendingUpdates > 0 and makes the
      // "unsaved" badge reappear even after a successful save.
      if (skippedSyncRef.current) {
        skippedSyncRef.current = false;
        const latestStats = statsRef.current;
        setBaselineMultipliers(
          Object.fromEntries(latestStats.map((s) => [s.id, s.multiplier])),
        );
        setFormValues(createInitialValues(latestStats));
      }
    }
  };

  const renderStatRow = (stat: ProfileStat) => {
    const statId = stat.id;
    const value = formValues[statId] ?? '';
    const errorMessage = fieldErrors[statId];
    const isOverride =
      Math.abs(stat.multiplier - stat.defaultMultiplier) > 0.0001;
    const parsed = parseInput(value);
    const isDirty =
      parsed !== null && Math.abs(parsed - stat.multiplier) > 0.0001;

    return (
      <XStack
        key={statId}
        paddingHorizontal="$4"
        paddingVertical="$2.5"
        gap="$3"
        alignItems="center"
        borderRadius="$3"
        backgroundColor={
          isDirty ? withAlpha(BRAND_NAVY_LIGHT, 0.12) : 'transparent'
        }
        hoverStyle={{
          backgroundColor: isDirty
            ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
            : '$backgroundHover',
        }}
        animation="quick"
        overflow="hidden"
        style={{ transition: 'background-color 0.2s ease' }}
      >
        {/* Invisible spacer aligned with accent bar */}
        <XStack width={4} flexShrink={0} />

        {/* Stat info — takes remaining space */}
        <YStack flex={1} space="$0.5" overflow="hidden">
          <XStack alignItems="center" gap="$1.5" overflow="hidden">
            <Text
              fontSize="$3"
              fontWeight="600"
              color="$color12"
              numberOfLines={1}
            >
              {stat.displayName}
            </Text>
            {isOverride && (
              <XStack
                paddingHorizontal={6}
                paddingVertical={1}
                borderRadius="$10"
                flexShrink={0}
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}, ${withAlpha(INDIGO, 0.2)})`,
                }}
              >
                <Text fontSize={9} fontWeight="700" color={BRAND_GOLD_LIGHT}>
                  CUSTOM
                </Text>
              </XStack>
            )}
            <Text fontSize={11} color="$gray8" numberOfLines={1} flexShrink={1}>
              (default {formatMultiplier(stat.defaultMultiplier)}x)
            </Text>
          </XStack>
          {stat.description ? (
            <Text fontSize="$1" color="$gray8" numberOfLines={1}>
              {stat.description}
            </Text>
          ) : null}
        </YStack>

        {/* Input + suffix + reset */}
        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          <Input
            value={value}
            onChangeText={(text: string) => handleValueChange(statId, text)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            disabled={isLocked}
            width={72}
            textAlign="right"
            fontSize="$3"
            fontWeight="600"
            paddingHorizontal="$2"
            borderColor={
              errorMessage
                ? '$red8'
                : isDirty
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                  : '$gray5'
            }
            borderWidth={1.5}
            borderRadius="$3"
            backgroundColor={errorMessage ? '$red2' : '$background'}
            focusStyle={{
              borderColor: errorMessage ? '$red8' : BRAND_NAVY_LIGHT,
              outlineWidth: 0,
            }}
            style={{
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            aria-label={`${stat.displayName} multiplier`}
          />
          <Text fontSize="$2" color="$gray8" fontWeight="500">
            x
          </Text>
          <Button
            size="$2"
            backgroundColor="transparent"
            borderColor="$gray5"
            borderWidth={1}
            color="$gray10"
            borderRadius="$3"
            paddingHorizontal="$1.5"
            onPress={() => handleResetStat(statId)}
            disabled={isLocked}
            opacity={isLocked ? 0.5 : 1}
            hoverStyle={{ backgroundColor: '$gray3', borderColor: '$gray7' }}
            pressStyle={{ scale: 0.97 }}
            aria-label={`Reset ${stat.displayName} multiplier`}
          >
            <RotateCcw size={12} />
          </Button>
        </XStack>

        {/* Error below the row */}
        {errorMessage ? (
          <Text
            fontSize={11}
            color="$red10"
            position="absolute"
            bottom={-2}
            right={12}
          >
            {errorMessage}
          </Text>
        ) : null}
      </XStack>
    );
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () =>
      GROUP_ORDER.reduce(
        (acc, g) => {
          acc[g] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      ),
  );

  const toggleGroup = (group: ScoringStatGroup) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <YStack
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      overflow="hidden"
      style={{ boxShadow: `0 4px 24px ${withAlpha(BLACK, 0.25)}` }}
    >
      {/* Panel header */}
      <XStack
        paddingHorizontal="$5"
        paddingVertical="$4"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$surfacePanelBorder"
        backgroundColor="$surfacePanel"
      >
        <XStack
          width={40}
          height={40}
          borderRadius="$4"
          alignItems="center"
          justifyContent="center"
          animation="quick"
          style={{
            background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.35)}, ${withAlpha(BRAND_NAVY_LIGHT, 0.12)})`,
            boxShadow: `0 0 16px ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
          }}
        >
          {isLocked ? (
            <Lock size={20} color="var(--gray10)" />
          ) : (
            <Settings2 size={20} color={BRAND_NAVY_LIGHT} />
          )}
        </XStack>
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="700" color="$color12">
            Scoring Settings
          </Text>
          <Text fontSize="$2" color="$gray9">
            {isLocked
              ? 'Scoring is locked — the season is in progress.'
              : 'Fine-tune how stats translate into fantasy points'}
          </Text>
        </YStack>
        {pendingUpdates.length > 0 && (
          <XStack
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$10"
            animation="quick"
            enterStyle={{ opacity: 0, scale: 0.8 }}
            style={{
              background: GRADIENT_BUTTON_PRIMARY,
              boxShadow: `0 0 12px ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
            }}
          >
            <Text fontSize={12} fontWeight="700" color="white">
              {pendingUpdates.length} unsaved
            </Text>
          </XStack>
        )}
      </XStack>

      <YStack padding="$4" space="$3">
        {isLocked ? (
          <XStack
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            borderWidth={1}
            padding="$3"
            borderRadius="$4"
            alignItems="center"
            gap="$2"
          >
            <Lock size={16} color="var(--yellow11)" />
            <Text fontSize="$3" color="$yellow11" fontWeight="600">
              Scoring settings are locked while the season is in progress.
              Changes can only be made before the draft is started.
            </Text>
          </XStack>
        ) : null}
        {error ? (
          <YStack
            backgroundColor="$red2"
            borderColor="$red6"
            borderWidth={1}
            padding="$3"
            borderRadius="$4"
            role="alert"
          >
            <Text fontSize="$3" color="$red11">
              Failed to load scoring profile: {error.message}
            </Text>
          </YStack>
        ) : null}

        {!error && loading ? (
          <YStack alignItems="center" padding="$6">
            <Text fontSize="$3" color="$gray10" role="status">
              Loading scoring profile…
            </Text>
          </YStack>
        ) : null}

        {!loading && stats.length === 0 ? (
          <YStack
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            borderWidth={1}
            padding="$3"
            borderRadius="$4"
          >
            <Text fontSize="$3" color="$yellow11">
              No scoring stats are available yet for this league.
            </Text>
          </YStack>
        ) : null}

        {/* Group sections */}
        {!loading && stats.length > 0
          ? GROUP_ORDER.map((group) => {
              const statsForGroup = groupedStats[group];
              if (!statsForGroup || statsForGroup.length === 0) return null;

              const copy = GROUP_COPY[group];
              const isExpanded = expandedGroups[group] !== false;
              const overrideCount = statsForGroup.filter(
                (s) => Math.abs(s.multiplier - s.defaultMultiplier) > 0.0001,
              ).length;

              return (
                <YStack
                  key={group}
                  borderColor="$surfacePanelBorder"
                  borderWidth={1}
                  borderRadius="$5"
                  overflow="hidden"
                  animation="quick"
                  hoverStyle={{ borderColor: '$borderColorHover' }}
                  style={{
                    background: `linear-gradient(180deg, ${copy.gradientFrom} 0%, transparent 40%)`,
                    boxShadow: `0 2px 12px ${withAlpha(BLACK, 0.15)}`,
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {/* Group header — clickable to collapse */}
                  <XStack
                    data-testid={`scoring-group-header-${group}`}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-label={`${copy.title} scoring group`}
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    alignItems="center"
                    gap="$3"
                    cursor="pointer"
                    onPress={() => toggleGroup(group)}
                    hoverStyle={{ backgroundColor: '$backgroundHover' }}
                    pressStyle={{ opacity: 0.85 }}
                    animation="quick"
                  >
                    <XStack
                      width={4}
                      height={28}
                      borderRadius={2}
                      backgroundColor={copy.accent}
                      style={{ boxShadow: `0 0 8px ${copy.gradientFrom}` }}
                    />
                    <YStack flex={1}>
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize="$4" fontWeight="700" color="$color12">
                          {copy.title}
                        </Text>
                        <Text fontSize="$2" color="$gray8">
                          {statsForGroup.length} stats
                        </Text>
                        {overrideCount > 0 && (
                          <XStack
                            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                            paddingHorizontal="$2"
                            paddingVertical={1}
                            borderRadius="$10"
                          >
                            <Text
                              fontSize={10}
                              fontWeight="700"
                              color={BRAND_GOLD_LIGHT}
                            >
                              {overrideCount} custom
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                      <Text fontSize="$2" color="$gray9">
                        {copy.description}
                      </Text>
                    </YStack>
                    {isExpanded ? (
                      <YStack animation="quick" rotate="0deg">
                        <ChevronUp size={16} color="$gray9" />
                      </YStack>
                    ) : (
                      <YStack animation="quick" rotate="0deg">
                        <ChevronDown size={16} color="$gray9" />
                      </YStack>
                    )}
                  </XStack>

                  {/* Stat rows — smooth height collapse via CSS grid */}
                  <YStack
                    data-testid={`scoring-group-grid-${group}`}
                    style={{
                      display: 'grid',
                      gridTemplateRows: isExpanded ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.3s ease-out',
                    }}
                  >
                    <YStack
                      overflow="hidden"
                      aria-hidden={!isExpanded}
                      style={{
                        minHeight: 0,
                        visibility: isExpanded ? 'visible' : 'hidden',
                        transition: isExpanded
                          ? 'visibility 0s'
                          : 'visibility 0s 0.3s',
                      }}
                    >
                      <YStack
                        data-testid={`scoring-section-body-${group}`}
                        paddingBottom="$2"
                      >
                        <Separator borderColor="$surfacePanelBorder" />
                        <YStack paddingTop="$1">
                          {statsForGroup.map((stat) => renderStatRow(stat))}
                        </YStack>
                      </YStack>
                    </YStack>
                  </YStack>
                </YStack>
              );
            })
          : null}

        {/* Sticky action bar */}
        <YStack
          gap="$3"
          paddingTop="$2"
          borderTopWidth={1}
          borderTopColor="$surfacePanelBorder"
        >
          <YStack space="$1">
            <AnimatePresence>
              {saveSuccess && (
                <XStack
                  key="success"
                  data-testid="scoring-saved-toast"
                  role="status"
                  aria-live="polite"
                  animation="quick"
                  enterStyle={{ opacity: 0, y: -4 }}
                  exitStyle={{ opacity: 0, y: -4 }}
                  alignItems="center"
                  gap="$2"
                >
                  <Zap size={14} color="$green10" />
                  <Text fontSize="$2" color="$green10" fontWeight="600">
                    Changes saved — scoring table refreshed.
                  </Text>
                </XStack>
              )}
            </AnimatePresence>
            {saveError ? (
              <Text fontSize="$2" color="$red10" role="alert">
                {saveError}
              </Text>
            ) : null}
            {hasValidationErrors ? (
              <Text fontSize="$2" color="$red9">
                Fix highlighted fields before saving.
              </Text>
            ) : null}
          </YStack>
          <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
            <Button
              size="$3"
              backgroundColor="transparent"
              borderColor="$gray6"
              borderWidth={1}
              color="$gray11"
              borderRadius="$4"
              onPress={handleResetAll}
              disabled={isLocked || loading || saving}
              hoverStyle={{ backgroundColor: '$gray3', borderColor: '$gray8' }}
              pressStyle={{ scale: 0.97 }}
              animation="quick"
              icon={<RotateCcw size={14} />}
            >
              Reset All
            </Button>
            <Button
              size="$3"
              backgroundColor={canSave ? BRAND_NAVY_LIGHT : '$gray5'}
              color="white"
              borderRadius="$4"
              onPress={() => {
                void handleSave();
              }}
              disabled={!canSave}
              hoverStyle={canSave ? { backgroundColor: BRAND_NAVY } : {}}
              pressStyle={canSave ? { scale: 0.97 } : {}}
              animation="quick"
              icon={<Save size={14} />}
            >
              {saving
                ? 'Saving…'
                : pendingUpdates.length > 0
                  ? `Save ${pendingUpdates.length} Change${pendingUpdates.length === 1 ? '' : 's'}`
                  : 'Save Changes'}
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
