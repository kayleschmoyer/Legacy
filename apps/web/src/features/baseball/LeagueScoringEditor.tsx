import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import {
  ChevronDown,
  ChevronUp,
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
    accent: '$blue9',
    gradientFrom: 'rgba(59,130,246,0.18)',
    gradientTo: 'transparent',
  },
  [ScoringStatGroup.Pitching]: {
    title: 'Pitching',
    description: 'Wins, strikeouts, saves, and ERA impact.',
    accent: '$green9',
    gradientFrom: 'rgba(34,197,94,0.18)',
    gradientTo: 'transparent',
  },
  [ScoringStatGroup.Fielding]: {
    title: 'Fielding',
    description: 'Fielding bonuses and errors.',
    accent: '$orange9',
    gradientFrom: 'rgba(249,115,22,0.18)',
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

function valuesToUpdates(stats: ProfileStat[], values: FormValueState) {
  return stats
    .map((stat) => {
      const value = values[stat.id];
      const parsed = parseInput(value);

      if (parsed === null) {
        return null;
      }

      const isChanged = Math.abs(parsed - stat.multiplier) > 0.0001;

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
  const { leagueId, profile, loading, error, onRefetch } = props;

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

  const [updateScoring, { loading: saving }] =
    useUpdateLeagueScoringProfileMutation();

  useEffect(() => {
    setFormValues(createInitialValues(stats));
    setFieldErrors(createInitialErrors(stats));
    setSaveError(null);
    setSaveSuccess(false);
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
    () => valuesToUpdates(stats, formValues),
    [stats, formValues],
  );

  const canSave =
    !loading && !saving && !hasValidationErrors && pendingUpdates.length > 0;

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

    try {
      await updateScoring({
        variables: {
          leagueId,
          updates: pendingUpdates,
        },
      });

      await onRefetch();
      setSaveSuccess(true);
      setSaveError(null);
    } catch (mutationError) {
      setSaveSuccess(false);
      setSaveError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to update scoring multipliers',
      );
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
        backgroundColor={isDirty ? '$blue2' : 'transparent'}
        hoverStyle={{
          backgroundColor: isDirty ? '$blue3' : '$backgroundHover',
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
                  background:
                    'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(99,102,241,0.2))',
                }}
              >
                <Text fontSize={9} fontWeight="700" color="$blue10">
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
            width={72}
            textAlign="right"
            fontSize="$3"
            fontWeight="600"
            paddingHorizontal="$2"
            borderColor={errorMessage ? '$red8' : isDirty ? '$blue7' : '$gray5'}
            borderWidth={1.5}
            borderRadius="$3"
            backgroundColor={errorMessage ? '$red2' : '$background'}
            focusStyle={{
              borderColor: errorMessage ? '$red8' : '$blue8',
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
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}
    >
      {/* Glassmorphism header */}
      <XStack
        paddingHorizontal="$5"
        paddingVertical="$4"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$surfacePanelBorder"
        style={{
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(10,15,26,0.85) 60%)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <XStack
          width={40}
          height={40}
          borderRadius="$4"
          alignItems="center"
          justifyContent="center"
          animation="quick"
          style={{
            background:
              'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(59,130,246,0.12))',
            boxShadow: '0 0 16px rgba(59,130,246,0.25)',
          }}
        >
          <Settings2 size={20} color="$blue10" />
        </XStack>
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="700" color="$color12">
            Scoring Settings
          </Text>
          <Text fontSize="$2" color="$gray9">
            Fine-tune how stats translate into fantasy points
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
              background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
              boxShadow: '0 0 12px rgba(59,130,246,0.4)',
            }}
          >
            <Text fontSize={12} fontWeight="700" color="white">
              {pendingUpdates.length} unsaved
            </Text>
          </XStack>
        )}
      </XStack>

      <YStack padding="$4" space="$3">
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
                    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {/* Group header — clickable to collapse */}
                  <XStack
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
                            backgroundColor="$blue3"
                            paddingHorizontal="$2"
                            paddingVertical={1}
                            borderRadius="$10"
                          >
                            <Text
                              fontSize={10}
                              fontWeight="700"
                              color="$blue10"
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
                    style={{
                      display: 'grid',
                      gridTemplateRows: isExpanded ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.3s ease-out',
                    }}
                  >
                    <YStack overflow="hidden" style={{ minHeight: 0 }}>
                      <YStack paddingBottom="$2">
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
              disabled={loading || saving}
              hoverStyle={{ backgroundColor: '$gray3', borderColor: '$gray8' }}
              pressStyle={{ scale: 0.97 }}
              animation="quick"
              icon={<RotateCcw size={14} />}
            >
              Reset All
            </Button>
            <Button
              size="$3"
              backgroundColor={canSave ? '$blue9' : '$gray5'}
              color="white"
              borderRadius="$4"
              onPress={() => {
                void handleSave();
              }}
              disabled={!canSave}
              hoverStyle={canSave ? { backgroundColor: '$blue10' } : {}}
              pressStyle={canSave ? { scale: 0.97 } : {}}
              animation="quick"
              icon={<Save size={14} />}
              style={
                canSave
                  ? {
                      background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                      boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
                      transition: 'box-shadow 0.2s ease',
                    }
                  : undefined
              }
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
