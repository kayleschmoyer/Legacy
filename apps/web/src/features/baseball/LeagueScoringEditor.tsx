import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Input, Text } from 'tamagui';
import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
  useUpdateLeagueScoringProfileMutation,
} from '../../api/db/graphql.generated';

const GROUP_COPY: Record<
  ScoringStatGroup,
  { title: string; description: string }
> = {
  [ScoringStatGroup.Batting]: {
    title: 'Batting Multipliers',
    description: 'Adjust hitter scoring such as home runs, RBIs, and steals.',
  },
  [ScoringStatGroup.Pitching]: {
    title: 'Pitching Multipliers',
    description: 'Tune pitcher scoring for wins, strikeouts, and saves.',
  },
  [ScoringStatGroup.Fielding]: {
    title: 'Fielding Multipliers',
    description: 'Control fielding bonuses and errors.',
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
    const helperText = stat.description;

    return (
      <YStack key={statId} space="$2">
        <XStack gap="$3" alignItems="flex-start" flexWrap="wrap">
          <YStack flex={1} minWidth={220} space="$1">
            <Text fontSize="$4" fontWeight="600" color="$color12">
              {stat.displayName}
            </Text>
            {helperText ? (
              <Text fontSize="$2" color="$gray10">
                {helperText}
              </Text>
            ) : null}
            <Text fontSize="$2" color="$gray9">
              Default: {formatMultiplier(stat.defaultMultiplier)}x
            </Text>
            {isOverride ? (
              <Text fontSize="$2" color="$blue10" fontWeight="600">
                Live override: {formatMultiplier(stat.multiplier)}x
              </Text>
            ) : null}
          </YStack>
          <YStack minWidth={140} alignItems="flex-end" space="$2">
            <Input
              value={value}
              onChangeText={(text: string) => handleValueChange(statId, text)}
              keyboardType="decimal-pad"
              inputMode="decimal"
              width={140}
              textAlign="right"
              borderColor={errorMessage ? '$red8' : '$surfacePanelBorder'}
              backgroundColor="$background"
              aria-label={`${stat.displayName} multiplier`}
            />
            {errorMessage ? (
              <Text fontSize="$2" color="$red10">
                {errorMessage}
              </Text>
            ) : null}
            <Button
              size="$2"
              backgroundColor="$gray3"
              color="$gray11"
              onPress={() => handleResetStat(statId)}
              aria-label={`Reset ${stat.displayName} multiplier`}
            >
              Reset
            </Button>
          </YStack>
        </XStack>
        <Separator borderColor="$outlineSubtle" />
      </YStack>
    );
  };

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
    >
      <YStack space="$4">
        <YStack space="$1">
          <Text fontSize="$5" fontWeight="700">
            Commissioner Scoring Controls
          </Text>
          <Text fontSize="$3" color="$gray10">
            Adjust multipliers to fine-tune how stats translate into fantasy
            points. Changes apply instantly for all teams.
          </Text>
        </YStack>

        {error ? (
          <Card
            backgroundColor="$red2"
            borderColor="$red7"
            padding="$3"
            role="alert"
          >
            <Text fontSize="$3" color="$red11">
              Failed to load scoring profile: {error.message}
            </Text>
          </Card>
        ) : null}

        {!error && loading ? (
          <Text fontSize="$3" color="$gray10" role="status">
            Loading scoring profile…
          </Text>
        ) : null}

        {!loading && stats.length === 0 ? (
          <Card backgroundColor="$yellow2" borderColor="$yellow6" padding="$3">
            <Text fontSize="$3" color="$yellow11">
              No scoring stats are available yet for this league.
            </Text>
          </Card>
        ) : null}

        {!loading && stats.length > 0
          ? GROUP_ORDER.map((group) => {
              const statsForGroup = groupedStats[group];

              if (!statsForGroup || statsForGroup.length === 0) {
                return null;
              }

              const copy = GROUP_COPY[group];

              return (
                <Card
                  key={group}
                  backgroundColor="$surfaceSubtle"
                  borderColor="$surfacePanelBorder"
                  padding="$4"
                  borderRadius="$5"
                  space="$3"
                >
                  <YStack space="$1">
                    <Text fontSize="$4" fontWeight="600">
                      {copy.title}
                    </Text>
                    <Text fontSize="$2" color="$gray10">
                      {copy.description}
                    </Text>
                  </YStack>
                  <Separator borderColor="$outlineSubtle" />
                  <YStack space="$4">
                    {statsForGroup.map((stat) => renderStatRow(stat))}
                  </YStack>
                </Card>
              );
            })
          : null}

        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$3"
        >
          <YStack space="$1">
            {saveSuccess ? (
              <Text fontSize="$3" color="$green10" role="status">
                Updates saved. The roster scoring table has been refreshed.
              </Text>
            ) : null}
            {saveError ? (
              <Text fontSize="$3" color="$red10" role="alert">
                {saveError}
              </Text>
            ) : null}
            {hasValidationErrors ? (
              <Text fontSize="$2" color="$red9">
                Fix highlighted fields before saving changes.
              </Text>
            ) : null}
          </YStack>
          <XStack gap="$2">
            <Button
              backgroundColor="$gray4"
              color="$gray12"
              onPress={handleResetAll}
              disabled={loading || saving}
            >
              Reset All to Default
            </Button>
            <Button
              backgroundColor="$blue9"
              color="white"
              onPress={() => {
                void handleSave();
              }}
              disabled={!canSave}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </XStack>
        </XStack>
      </YStack>
    </Card>
  );
}
