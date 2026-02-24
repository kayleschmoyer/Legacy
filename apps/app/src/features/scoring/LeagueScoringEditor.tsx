import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Alert, LayoutAnimation, Pressable } from 'react-native';
import { AnimatePresence } from 'tamagui';
import {
  collectProfileStats,
  createInitialErrors,
  createInitialValues,
  type FieldErrorState,
  formatMultiplier,
  type FormValueState,
  groupStatsByGroup,
  isStatDirty,
  isStatOverridden,
  type ProfileStat,
  SCORING_GROUP_COPY,
  SCORING_GROUP_ORDER,
  validateStat,
  valuesToUpdates,
} from '@legacy-sports/scoring';
import {
  type GetLeagueScoringProfileQuery,
  useUpdateLeagueScoringProfileMutation,
} from '../../api/db/graphql.generated';

// ── Types ────────────────────────────────────────────────────────────────────

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

interface LeagueScoringEditorProps {
  readonly leagueId: number;
  readonly profile: LeagueScoringProfile | null | undefined;
  readonly loading: boolean;
  readonly error?: Error | null;
  readonly onRefetch: () => Promise<unknown>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueScoringEditor(
  props: LeagueScoringEditorProps,
): React.JSX.Element {
  const { leagueId, profile, loading, error, onRefetch } = props;

  const stats = useMemo(() => collectProfileStats(profile), [profile]);
  const groupedStats = useMemo(
    () => groupStatsByGroup(stats, SCORING_GROUP_ORDER),
    [stats],
  );

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
      setSaveSuccess(false);
    },
    [statById],
  );

  const handleResetStat = useCallback(
    (statId: number) => {
      const stat = statById.get(statId);
      if (!stat) return;
      setFormValues((prev) => ({
        ...prev,
        [statId]: formatMultiplier(stat.defaultMultiplier),
      }));
      setFieldErrors((prev) => ({ ...prev, [statId]: null }));
      setSaveError(null);
      setSaveSuccess(false);
    },
    [statById],
  );

  const handleResetAll = useCallback(() => {
    const nextValues: FormValueState = {};
    for (const stat of stats) {
      nextValues[stat.id] = formatMultiplier(stat.defaultMultiplier);
    }
    setFormValues(nextValues);
    setFieldErrors(createInitialErrors(stats));
    setSaveError(null);
    setSaveSuccess(false);
  }, [stats]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    try {
      await updateScoring({
        variables: { leagueId, updates: pendingUpdates },
      });
      await onRefetch();
      setSaveSuccess(true);
      setSaveError(null);
      Alert.alert('Success', 'Scoring settings have been updated.');
    } catch (mutationError) {
      setSaveSuccess(false);
      setSaveError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to update scoring multipliers',
      );
    }
  }, [canSave, updateScoring, leagueId, pendingUpdates, onRefetch]);

  // ── Collapsed state ─────────────────────────────────────────────────────

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () =>
      SCORING_GROUP_ORDER.reduce(
        (acc, g) => {
          acc[g] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      ),
  );

  const toggleGroup = useCallback((group: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

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
          Failed to load scoring profile: {error.message}
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
      <YStack gap="$3" paddingBottom="$4">
        {/* Header with accent */}
        <YStack
          gap="$1"
          paddingHorizontal="$1"
          paddingBottom="$1"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack alignItems="center" gap="$2">
            <XStack
              width={32}
              height={32}
              borderRadius={10}
              backgroundColor="$blue3"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={16} accessibilityLabel="Settings">
                ⚙
              </Text>
            </XStack>
            <H4 color="$color12">Scoring Settings</H4>
          </XStack>
          <Text fontSize="$2" color="$gray9" paddingLeft={42}>
            Adjust how stats translate into fantasy points
          </Text>
        </YStack>

        {/* Unsaved badge */}
        {pendingUpdates.length > 0 && (
          <XStack
            alignSelf="flex-start"
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            borderRadius="$10"
            backgroundColor="$blue9"
            animation="quick"
            enterStyle={{ opacity: 0, scale: 0.8 }}
            elevation={4}
          >
            <Text fontSize={12} fontWeight="700" color="white">
              {pendingUpdates.length} unsaved change
              {pendingUpdates.length === 1 ? '' : 's'}
            </Text>
          </XStack>
        )}

        {/* Group sections */}
        {SCORING_GROUP_ORDER.map((group) => {
          const statsForGroup = groupedStats[group];
          if (!statsForGroup || statsForGroup.length === 0) return null;
          const copy = SCORING_GROUP_COPY[group];
          const isExpanded = expandedGroups[group] !== false;
          const overrideCount = statsForGroup.filter(isStatOverridden).length;

          return (
            <Card
              key={group}
              backgroundColor="$background"
              borderColor="$borderColor"
              borderWidth={1}
              borderRadius="$5"
              overflow="hidden"
              animation="quick"
              elevation={2}
            >
              {/* Group header — tap to collapse */}
              <Pressable
                onPress={() => toggleGroup(group)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$3"
                  alignItems="center"
                  gap="$2.5"
                  backgroundColor={
                    isExpanded ? '$backgroundFocus' : 'transparent'
                  }
                >
                  <XStack
                    width={4}
                    height={26}
                    borderRadius={2}
                    backgroundColor={copy.accent}
                  />
                  <YStack flex={1}>
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize="$4" fontWeight="700" color="$color12">
                        {copy.title}
                      </Text>
                      <Text fontSize="$2" color="$gray8">
                        {statsForGroup.length}
                      </Text>
                      {overrideCount > 0 && (
                        <XStack
                          backgroundColor="$blue3"
                          paddingHorizontal="$1.5"
                          paddingVertical={1}
                          borderRadius="$10"
                        >
                          <Text fontSize={10} fontWeight="700" color="$blue10">
                            {overrideCount} custom
                          </Text>
                        </XStack>
                      )}
                    </XStack>
                    <Text fontSize={12} color="$gray8">
                      {copy.description}
                    </Text>
                  </YStack>
                  <Text fontSize="$3" color="$gray8">
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </XStack>
              </Pressable>

              {/* Stat rows */}
              {isExpanded && (
                <YStack>
                  <Separator borderColor="$borderColor" />
                  {statsForGroup.map((stat, idx) => {
                    const value = formValues[stat.id] ?? '';
                    const errorMessage = fieldErrors[stat.id];
                    const isOverride = isStatOverridden(stat);
                    const isDirty = isStatDirty(stat, value);

                    return (
                      <YStack key={stat.id}>
                        <XStack
                          paddingHorizontal="$3"
                          paddingVertical="$2.5"
                          alignItems="center"
                          gap="$2"
                          backgroundColor={isDirty ? '$blue2' : 'transparent'}
                          animation="quick"
                        >
                          {/* Stat info */}
                          <YStack flex={1} gap="$0.5">
                            <XStack alignItems="center" gap="$1.5">
                              <Text
                                fontSize="$3"
                                fontWeight="600"
                                color="$color12"
                              >
                                {stat.displayName}
                              </Text>
                              {isOverride && (
                                <XStack
                                  backgroundColor="$blue3"
                                  paddingHorizontal={6}
                                  paddingVertical={1}
                                  borderRadius={20}
                                >
                                  <Text
                                    fontSize={9}
                                    fontWeight="700"
                                    color="$blue10"
                                  >
                                    CUSTOM
                                  </Text>
                                </XStack>
                              )}
                            </XStack>
                            <Text fontSize={11} color="$gray8">
                              Default:{' '}
                              {formatMultiplier(stat.defaultMultiplier)}x
                            </Text>
                          </YStack>

                          {/* Input + reset */}
                          <YStack alignItems="flex-end" gap="$1">
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
                                borderColor={
                                  errorMessage
                                    ? '$red8'
                                    : isDirty
                                      ? '$blue7'
                                      : '$gray5'
                                }
                                borderWidth={1.5}
                                borderRadius="$3"
                                backgroundColor={
                                  errorMessage ? '$red2' : '$background'
                                }
                                size="$3"
                              />
                              <Text
                                fontSize="$2"
                                color="$gray8"
                                fontWeight="500"
                              >
                                x
                              </Text>
                            </XStack>
                            {errorMessage ? (
                              <Text fontSize={10} color="$red10">
                                {errorMessage}
                              </Text>
                            ) : null}
                          </YStack>

                          {/* Reset button */}
                          <Pressable
                            onPress={() => handleResetStat(stat.id)}
                            hitSlop={8}
                          >
                            <XStack
                              width={28}
                              height={28}
                              borderRadius="$2"
                              borderWidth={1}
                              borderColor="$gray5"
                              alignItems="center"
                              justifyContent="center"
                            >
                              <Text fontSize={12} color="$gray9">
                                ↺
                              </Text>
                            </XStack>
                          </Pressable>
                        </XStack>
                        {idx < statsForGroup.length - 1 && (
                          <Separator borderColor="$borderColor" opacity={0.5} />
                        )}
                      </YStack>
                    );
                  })}
                </YStack>
              )}
            </Card>
          );
        })}

        {/* Status messages */}
        <AnimatePresence>
          {saveSuccess && (
            <XStack
              key="success"
              alignItems="center"
              gap="$2"
              paddingHorizontal="$2"
              animation="quick"
              enterStyle={{ opacity: 0, y: -4 }}
              exitStyle={{ opacity: 0, y: -4 }}
            >
              <Text fontSize="$2" color="$green10" fontWeight="600">
                ✓ Scoring settings saved successfully.
              </Text>
            </XStack>
          )}
        </AnimatePresence>
        {saveError && (
          <Text fontSize="$2" color="$red10" paddingHorizontal="$2">
            {saveError}
          </Text>
        )}
        {hasValidationErrors && (
          <Text fontSize="$2" color="$red9" paddingHorizontal="$2">
            Fix highlighted fields before saving.
          </Text>
        )}

        {/* Action buttons */}
        <XStack gap="$2" paddingTop="$1">
          <Button
            flex={1}
            size="$4"
            backgroundColor="transparent"
            borderColor="$gray6"
            borderWidth={1}
            borderRadius="$4"
            onPress={handleResetAll}
            disabled={loading || saving}
            pressStyle={{ scale: 0.97, opacity: 0.8, borderColor: '$gray8' }}
            animation="quick"
          >
            <Text fontWeight="600" color="$gray11" fontSize="$3">
              Reset All
            </Text>
          </Button>
          <Button
            flex={1}
            size="$4"
            backgroundColor={canSave ? '$blue9' : '$gray5'}
            borderRadius="$4"
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            opacity={canSave ? 1 : 0.5}
            pressStyle={
              canSave ? { scale: 0.97, backgroundColor: '$blue10' } : {}
            }
            animation="quick"
            elevation={canSave ? 4 : 0}
          >
            <Text fontWeight="700" color="white" fontSize="$3">
              {saving
                ? 'Saving…'
                : pendingUpdates.length > 0
                  ? `Save (${pendingUpdates.length})`
                  : 'Save'}
            </Text>
          </Button>
        </XStack>
      </YStack>
    </ScrollView>
  );
}
