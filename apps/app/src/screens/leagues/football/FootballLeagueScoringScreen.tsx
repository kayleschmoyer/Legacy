import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Alert, LayoutAnimation, Pressable } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import {
  collectProfileStats,
  createInitialErrors,
  createInitialValues,
  type FieldErrorState,
  FOOTBALL_SCORING_GROUP_ORDER,
  type FormValueState,
  type ProfileStat,
  SCORING_GROUP_COPY,
  validateStat,
  valuesToUpdates,
} from '@legacy-sports/scoring';
import {
  type GetLeagueScoringProfileQuery,
  useUpdateLeagueScoringProfileMutation,
} from '../../../api/db/graphql.generated';

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

interface FootballLeagueScoringScreenProps {
  readonly leagueId: number;
  readonly profile: LeagueScoringProfile | null | undefined;
  readonly loading: boolean;
  readonly error?: Error | null;
  readonly onRefetch: () => Promise<unknown>;
  /** 'dst' or 'idp' — controls which defensive section is shown. */
  readonly defensiveFormat?: string | null;
}

/**
 * Returns the ordered list of scoring stat groups to display for a football league.
 * Includes 'defense' for DST leagues and 'idp' for IDP leagues; always includes
 * offensive groups (passing, rushing, receiving, kicking).
 *
 * @param defensiveFormat - 'dst' for team defense, 'idp' for individual defensive players,
 *   or null/undefined (defaults to DST).
 * @returns Filtered, ordered array of group keys for rendering.
 */
export function getFootballGroupOrder(
  defensiveFormat: string | null | undefined,
): readonly string[] {
  const isDst = defensiveFormat !== 'idp';
  return FOOTBALL_SCORING_GROUP_ORDER.filter((g) => {
    if (g === 'defense') return isDst;
    if (g === 'idp') return !isDst;
    return true;
  });
}

export function FootballLeagueScoringScreen(
  props: FootballLeagueScoringScreenProps,
): React.JSX.Element {
  const { leagueId, profile, loading, error, onRefetch, defensiveFormat } =
    props;

  const groupOrder = useMemo(
    () => getFootballGroupOrder(defensiveFormat),
    [defensiveFormat],
  );

  const stats = useMemo(() => collectProfileStats(profile), [profile]);

  const groupedStats = useMemo(() => {
    const groups: Record<string, ProfileStat[]> = {};
    for (const g of groupOrder) groups[g] = [];

    for (const stat of stats) {
      if (groupOrder.includes(stat.group)) {
        groups[stat.group].push(stat);
      }
    }

    for (const g of groupOrder) {
      groups[g].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    return groups;
  }, [stats, groupOrder]);

  const [formValues, setFormValues] = useState<FormValueState>(() =>
    createInitialValues(stats),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>(() =>
    createInitialErrors(stats),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const [updateScoring, { loading: saving }] =
    useUpdateLeagueScoringProfileMutation();

  useEffect(() => {
    setFormValues(createInitialValues(stats));
    setFieldErrors(createInitialErrors(stats));
    setSaveError(null);
  }, [stats]);

  useEffect(() => {
    if (error) {
      LOGGER.error('Failed to load scoring profile', error, { leagueId });
    }
  }, [error, leagueId]);

  const statById = useMemo(() => {
    const map = new Map<number, ProfileStat>();
    for (const stat of stats) map.set(stat.id, stat);
    return map;
  }, [stats]);

  const hasValidationErrors = useMemo(
    () => Object.values(fieldErrors).some(Boolean),
    [fieldErrors],
  );

  const pendingUpdates = useMemo(
    () => valuesToUpdates(stats, formValues),
    [stats, formValues],
  );

  const canSave =
    !loading && !saving && !hasValidationErrors && pendingUpdates.length > 0;

  const handleValueChange = useCallback(
    (statId: number, nextValue: string) => {
      setFormValues((prev) => ({ ...prev, [statId]: nextValue }));
      const stat = statById.get(statId);
      if (stat) {
        setFieldErrors((prev) => ({
          ...prev,
          [statId]: validateStat(stat, nextValue),
        }));
      }
      setSaveError(null);
    },
    [statById],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    try {
      await updateScoring({
        variables: { leagueId, updates: pendingUpdates },
      });
      await onRefetch();
      Alert.alert('Saved', 'Football scoring settings updated.');
    } catch (mutationError) {
      LOGGER.error(
        'Failed to update football scoring settings',
        mutationError instanceof Error
          ? mutationError
          : new Error(String(mutationError)),
        { leagueId },
      );
      setSaveError('Failed to update scoring settings. Please try again.');
    }
  }, [canSave, updateScoring, leagueId, pendingUpdates, onRefetch]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () =>
      groupOrder.reduce<Record<string, boolean>>(
        (acc, g) => ({ ...acc, [g]: true }),
        {},
      ),
  );

  const toggleGroup = useCallback((group: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  if (error) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red7"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$red11">
          Failed to load scoring profile.
        </Text>
      </Card>
    );
  }

  if (loading) {
    return (
      <YStack alignItems="center" padding="$6" gap="$3">
        <Spinner size="large" color="$blue9" />
        <Text fontSize="$3" color="$gray9">
          Loading scoring profile…
        </Text>
      </YStack>
    );
  }

  if (stats.length === 0) {
    return (
      <Card
        backgroundColor="$yellow2"
        borderColor="$yellow6"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$yellow11">
          No scoring stats are available yet for this league.
        </Text>
      </Card>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <YStack gap="$3" paddingBottom="$8">
        {groupOrder.map((group) => {
          const statsForGroup = groupedStats[group];
          if (!statsForGroup || statsForGroup.length === 0) return null;

          const copy = SCORING_GROUP_COPY[group];
          if (!copy) return null;

          const isExpanded = expandedGroups[group] !== false;

          return (
            <Card
              key={group}
              bordered
              backgroundColor="$background"
              borderRadius="$4"
              overflow="hidden"
            >
              <Pressable
                onPress={() => toggleGroup(group)}
                accessibilityRole="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleGroup(group);
                  }
                }}
              >
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$3"
                  alignItems="center"
                  gap="$2"
                  backgroundColor="$backgroundHover"
                >
                  <YStack flex={1}>
                    <Text fontSize="$4" fontWeight="700" color="$color12">
                      {copy.title}
                    </Text>
                    <Text fontSize="$2" color="$gray9">
                      {copy.description}
                    </Text>
                  </YStack>
                  <Text fontSize="$3" color="$gray9">
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </XStack>
              </Pressable>

              {isExpanded ? (
                <YStack paddingBottom="$2">
                  <Separator />
                  {statsForGroup.map((stat) => {
                    const value = formValues[stat.id] ?? '';
                    const errorMessage = fieldErrors[stat.id];
                    return (
                      <YStack key={stat.id}>
                        <XStack
                          paddingHorizontal="$3"
                          paddingVertical="$2"
                          alignItems="center"
                          gap="$2"
                        >
                          <YStack flex={1}>
                            <Text
                              fontSize="$3"
                              fontWeight="600"
                              color="$color12"
                            >
                              {stat.displayName}
                            </Text>
                            {stat.description ? (
                              <Text fontSize="$1" color="$gray8">
                                {stat.description}
                              </Text>
                            ) : null}
                          </YStack>
                          <XStack alignItems="center" gap="$1">
                            <Input
                              value={value}
                              onChangeText={(text: string) =>
                                handleValueChange(stat.id, text)
                              }
                              keyboardType="decimal-pad"
                              width={80}
                              textAlign="right"
                              fontSize="$3"
                              fontWeight="600"
                              borderColor={errorMessage ? '$red8' : '$gray5'}
                              borderWidth={1}
                              borderRadius="$3"
                              backgroundColor={
                                errorMessage ? '$red2' : '$background'
                              }
                              aria-label={`${stat.displayName} multiplier`}
                            />
                            <Text fontSize="$2" color="$gray8">
                              x
                            </Text>
                          </XStack>
                        </XStack>
                        {errorMessage ? (
                          <Text
                            fontSize="$1"
                            color="$red10"
                            paddingHorizontal="$3"
                            paddingBottom="$1"
                          >
                            {errorMessage}
                          </Text>
                        ) : null}
                      </YStack>
                    );
                  })}
                </YStack>
              ) : null}
            </Card>
          );
        })}

        {/* Error banner */}
        {saveError ? (
          <Card
            backgroundColor="$red2"
            borderColor="$red7"
            borderWidth={1}
            padding="$3"
            borderRadius="$4"
          >
            <Text fontSize="$3" color="$red11">
              {saveError}
            </Text>
          </Card>
        ) : null}

        {/* Save button */}
        <Button
          onPress={() => void handleSave()}
          disabled={!canSave}
          backgroundColor={canSave ? '$blue9' : '$gray5'}
          color="white"
          borderRadius="$4"
          size="$4"
          marginHorizontal="$1"
        >
          {saving
            ? 'Saving…'
            : pendingUpdates.length > 0
              ? `Save ${pendingUpdates.length} Change${pendingUpdates.length === 1 ? '' : 's'}`
              : 'Save Changes'}
        </Button>
      </YStack>
    </ScrollView>
  );
}
