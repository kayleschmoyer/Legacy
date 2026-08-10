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
import { LOGGER } from '@legacy-sports/logging';
import {
  collectPositionBonuses,
  collectProfileStats,
  createInitialErrors,
  createInitialPositionBonusValues,
  createInitialValues,
  type FieldErrorState,
  FOOTBALL_SCORING_GROUP_ORDER,
  formatMultiplier,
  type FormValueState,
  groupStatsByGroup,
  IDP_BONUS_POSITIONS,
  isStatDirty,
  isStatOverridden,
  OFFENSE_BONUS_POSITIONS,
  parseInput,
  type PositionBonusFieldErrorState,
  type PositionBonusFormValueState,
  positionBonusKey,
  positionBonusValuesToUpdates,
  type ProfileStat,
  SCORING_GROUP_COPY,
  SCORING_GROUP_ORDER,
  validatePositionBonus,
  validateStat,
  valuesToUpdates,
} from '@legacy-sports/scoring';
import { PremiumGate } from '@legacy-sports/shared-components';
import {
  DefensiveFormat,
  type GetLeagueScoringProfileQuery,
  Sport,
  useUpdateLeagueScoringPositionBonusesMutation,
  useUpdateLeagueScoringProfileMutation,
} from '@legacy-sports/graphql';
import { useKeyboardActivation } from '../../common/hooks/useKeyboardActivation';

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
  /** Defaults to `Sport.Baseball` so existing baseball call sites are unaffected. */
  readonly sport?: Sport;
  /** Football-only. Determines whether the IDP or DST (`defense`) stat group renders. */
  readonly defensiveFormat?: DefensiveFormat | string | null;
  /** Whether the commissioner's league has the `custom_scoring_multipliers` entitlement. */
  readonly isPremium?: boolean;
  /** Optional upgrade callback forwarded to the position-bonus PremiumGate. */
  readonly onUpgrade?: () => void;
}

/**
 * Group order depends on sport, and for football on `defensiveFormat`: only
 * one of the DST ("defense") or IDP stat groups applies to a given league.
 */
function getGroupOrder(
  sport: Sport,
  defensiveFormat: DefensiveFormat | string | null | undefined,
): readonly string[] {
  if (sport !== Sport.Football) {
    return SCORING_GROUP_ORDER;
  }

  const isIdp = defensiveFormat === DefensiveFormat.Idp;

  return FOOTBALL_SCORING_GROUP_ORDER.filter((group) => {
    if (group === 'defense') return !isIdp;
    if (group === 'idp') return isIdp;
    return true;
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function LeagueScoringEditor(
  props: LeagueScoringEditorProps,
): React.JSX.Element {
  const {
    leagueId,
    profile,
    loading,
    error,
    onRefetch,
    sport = Sport.Baseball,
    defensiveFormat,
    isPremium = false,
    onUpgrade,
  } = props;

  const groupOrder = useMemo(
    () => getGroupOrder(sport, defensiveFormat),
    [sport, defensiveFormat],
  );

  const stats = useMemo(() => collectProfileStats(profile), [profile]);
  const groupedStats = useMemo(
    () => groupStatsByGroup(stats, groupOrder),
    [stats, groupOrder],
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
      groupOrder.reduce(
        (acc, g) => {
          acc[g] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      ),
  );

  // Backfill any group that wasn't part of the initial `groupOrder` (e.g. the
  // league's sport/defensiveFormat resolves after first mount) so it starts
  // expanded rather than being silently absent from the toggle map.
  useEffect(() => {
    setExpandedGroups((prev) => {
      const missing = groupOrder.filter((g) => !(g in prev));
      if (missing.length === 0) {
        return prev;
      }
      const next = { ...prev };
      for (const g of missing) {
        next[g] = true;
      }
      return next;
    });
  }, [groupOrder]);

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
        <Spinner size="large" color="$brandNavyLight" />
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
              backgroundColor="$surfaceInteractive"
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
            backgroundColor="$brandNavyLight"
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
        {groupOrder.map((group) => {
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
                          backgroundColor="$surfaceInteractive"
                          paddingHorizontal="$1.5"
                          paddingVertical={1}
                          borderRadius="$10"
                        >
                          <Text
                            fontSize={10}
                            fontWeight="700"
                            color="$brandGoldLight"
                          >
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
                          backgroundColor={
                            isDirty ? '$surfaceInteractive' : 'transparent'
                          }
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
                                  backgroundColor="$surfaceInteractive"
                                  paddingHorizontal={6}
                                  paddingVertical={1}
                                  borderRadius={20}
                                >
                                  <Text
                                    fontSize={9}
                                    fontWeight="700"
                                    color="$brandGoldLight"
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
                                      ? '$outlineStrong'
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

        {/* Position-scoped scoring bonuses (LS-9106) — football leagues only. */}
        {sport === Sport.Football ? (
          <PremiumGate
            isPremium={isPremium}
            featureName="Position-Scoped Scoring Bonuses"
            featureDescription="Give bonus points to specific positions (e.g. extra points per TE reception, or custom IDP point values) on top of the league's base scoring."
            onUpgrade={onUpgrade}
          >
            <PositionBonusSection
              leagueId={leagueId}
              profile={profile}
              defensiveFormat={defensiveFormat}
              availableStats={stats}
              onRefetch={onRefetch}
            />
          </PremiumGate>
        ) : null}

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
            backgroundColor={canSave ? '$brandNavyLight' : '$gray5'}
            borderRadius="$4"
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            opacity={canSave ? 1 : 0.5}
            pressStyle={
              canSave ? { scale: 0.97, backgroundColor: '$brandNavyDark' } : {}
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

// ── Position bonus section ──────────────────────────────────────────────────

interface PositionBonusSectionProps {
  readonly leagueId: number;
  readonly profile: LeagueScoringProfile | null | undefined;
  readonly defensiveFormat?: DefensiveFormat | string | null;
  readonly availableStats: readonly ProfileStat[];
  readonly onRefetch: () => Promise<unknown>;
}

interface DraftBonus {
  position: string;
  statDefinitionId: number;
  value: string;
}

/**
 * Commissioner UI for position-scoped scoring bonuses (LS-9106). Additive on
 * top of the league's base stat multiplier — e.g. a TE-specific reception
 * bonus, or custom per-stat IDP point values. Mirrors the flat-multiplier
 * editor's row/edit/validate mechanics above, backed by the real
 * `updateLeagueScoringPositionBonuses` mutation (LS-9104).
 */
function PositionBonusSection(
  props: PositionBonusSectionProps,
): React.JSX.Element {
  const { leagueId, profile, defensiveFormat, availableStats, onRefetch } =
    props;

  const bonuses = useMemo(() => collectPositionBonuses(profile), [profile]);

  const positions = useMemo(
    () =>
      defensiveFormat === DefensiveFormat.Idp
        ? [...OFFENSE_BONUS_POSITIONS, ...IDP_BONUS_POSITIONS]
        : OFFENSE_BONUS_POSITIONS,
    [defensiveFormat],
  );

  const statOptions = useMemo(
    () =>
      [...availableStats].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    [availableStats],
  );

  const statById = useMemo(() => {
    const map = new Map<number, ProfileStat>();
    for (const stat of statOptions) {
      map.set(stat.id, stat);
    }
    return map;
  }, [statOptions]);

  const [formValues, setFormValues] = useState<PositionBonusFormValueState>(
    () => createInitialPositionBonusValues(bonuses),
  );
  const [fieldErrors, setFieldErrors] = useState<PositionBonusFieldErrorState>(
    {},
  );
  const [draft, setDraft] = useState<DraftBonus | null>(null);
  const [draftInputError, setDraftInputError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFormValues(createInitialPositionBonusValues(bonuses));
    setFieldErrors({});
    setSaveError(null);
  }, [bonuses]);

  const [updatePositionBonuses, { loading: saving }] =
    useUpdateLeagueScoringPositionBonusesMutation();

  const pendingUpdates = useMemo(
    () => positionBonusValuesToUpdates(bonuses, formValues),
    [bonuses, formValues],
  );

  const hasValidationErrors = useMemo(
    () => Object.values(fieldErrors).some(Boolean),
    [fieldErrors],
  );

  const canSave = !saving && !hasValidationErrors && pendingUpdates.length > 0;

  const handleValueChange = useCallback(
    (position: string, statDefinitionId: number, nextValue: string) => {
      const rowKey = positionBonusKey(position, statDefinitionId);
      setFormValues((prev) => ({ ...prev, [rowKey]: nextValue }));
      setFieldErrors((prev) => ({
        ...prev,
        [rowKey]: validatePositionBonus(nextValue),
      }));
      setSaveError(null);
    },
    [],
  );

  const startDraft = useCallback(() => {
    if (statOptions.length === 0 || positions.length === 0) return;
    setDraft({
      position: positions[0],
      statDefinitionId: statOptions[0].id,
      value: formatMultiplier(0),
    });
    setDraftInputError(null);
  }, [statOptions, positions]);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setDraftInputError(null);
  }, []);

  const handleDraftValueChange = useCallback((text: string) => {
    setDraft((prev) => (prev ? { ...prev, value: text } : prev));
    setDraftInputError(validatePositionBonus(text));
  }, []);

  const cyclePosition = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const index = positions.indexOf(prev.position);
      const next = positions[(index + 1) % positions.length];
      return { ...prev, position: next };
    });
  }, [positions]);

  const cycleStat = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const index = statOptions.findIndex(
        (s) => s.id === prev.statDefinitionId,
      );
      const next = statOptions[(index + 1) % statOptions.length];
      return { ...prev, statDefinitionId: next.id };
    });
  }, [statOptions]);

  const cyclePositionKeyboardProps = useKeyboardActivation(cyclePosition);
  const cycleStatKeyboardProps = useKeyboardActivation(cycleStat);

  const handleSave = useCallback(async () => {
    let updates = pendingUpdates;

    if (draft) {
      const validationError = validatePositionBonus(draft.value);
      if (validationError) {
        setDraftInputError(validationError);
        return;
      }

      const rowKey = positionBonusKey(draft.position, draft.statDefinitionId);
      const isDuplicate = bonuses.some(
        (b) => positionBonusKey(b.position, b.statDefinitionId) === rowKey,
      );
      if (isDuplicate) {
        setDraftInputError(
          'A bonus for this position and stat already exists.',
        );
        return;
      }

      const parsed = parseInput(draft.value);
      if (parsed === null) {
        setDraftInputError('Enter a number for the bonus value');
        return;
      }

      updates = [
        ...pendingUpdates,
        {
          position: draft.position,
          statDefinitionId: draft.statDefinitionId,
          bonusMultiplier: parsed,
        },
      ];
    }

    if (updates.length === 0) return;

    try {
      await updatePositionBonuses({
        variables: { leagueId, updates },
      });
      await onRefetch();
      setDraft(null);
      setDraftInputError(null);
      setSaveError(null);
    } catch (mutationError) {
      const error =
        mutationError instanceof Error
          ? mutationError
          : new Error(String(mutationError));
      LOGGER.error('Failed to update position bonuses', error, { leagueId });
      setSaveError(error.message);
    }
  }, [
    draft,
    bonuses,
    pendingUpdates,
    updatePositionBonuses,
    leagueId,
    onRefetch,
  ]);

  const handleRemove = useCallback(
    async (position: string, statDefinitionId: number) => {
      try {
        await updatePositionBonuses({
          variables: {
            leagueId,
            updates: [{ position, statDefinitionId, isEnabled: false }],
          },
        });
        await onRefetch();
      } catch (mutationError) {
        const error =
          mutationError instanceof Error
            ? mutationError
            : new Error(String(mutationError));
        LOGGER.error('Failed to remove position bonus', error, { leagueId });
        setSaveError(error.message);
      }
    },
    [updatePositionBonuses, leagueId, onRefetch],
  );

  return (
    <Card
      backgroundColor="$background"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
    >
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$3"
        alignItems="center"
        gap="$2"
        backgroundColor="$backgroundFocus"
      >
        <YStack flex={1}>
          <Text fontSize="$4" fontWeight="700" color="$color12">
            Position Bonuses
          </Text>
          <Text fontSize={12} color="$gray8">
            Extra points for a specific position on a stat, on top of the base
            multiplier above.
          </Text>
        </YStack>
        <Button
          size="$2"
          backgroundColor="transparent"
          borderColor="$brandGoldLight"
          borderWidth={1}
          onPress={startDraft}
          disabled={statOptions.length === 0 || draft !== null}
          opacity={statOptions.length === 0 ? 0.5 : 1}
          aria-label="Add position bonus"
        >
          <Text fontSize="$2" fontWeight="600" color="$brandGoldLight">
            + Add
          </Text>
        </Button>
      </XStack>

      <Separator borderColor="$borderColor" />

      <YStack padding="$3" gap="$2">
        {bonuses.length === 0 && !draft ? (
          <Text fontSize="$2" color="$gray9" paddingVertical="$2">
            No position bonuses configured yet.
          </Text>
        ) : null}

        {bonuses.map((bonus) => {
          const rowKey = positionBonusKey(
            bonus.position,
            bonus.statDefinitionId,
          );
          const value =
            formValues[rowKey] ?? formatMultiplier(bonus.bonusMultiplier);
          const errorMessage = fieldErrors[rowKey];

          return (
            <YStack key={rowKey} gap="$1">
              <XStack alignItems="center" gap="$2">
                <XStack
                  paddingHorizontal="$2"
                  paddingVertical={2}
                  borderRadius="$3"
                  backgroundColor="$surfaceInteractive"
                  minWidth={40}
                  justifyContent="center"
                >
                  <Text fontSize={11} fontWeight="700" color="$color12">
                    {bonus.position}
                  </Text>
                </XStack>
                <Text fontSize="$3" color="$color12" flex={1} numberOfLines={1}>
                  {bonus.statDisplayName}
                </Text>
                <Input
                  value={value}
                  onChangeText={(text: string) =>
                    handleValueChange(
                      bonus.position,
                      bonus.statDefinitionId,
                      text,
                    )
                  }
                  keyboardType="decimal-pad"
                  width={72}
                  textAlign="right"
                  fontSize="$3"
                  fontWeight="600"
                  borderColor={errorMessage ? '$red8' : '$gray5'}
                  borderWidth={1.5}
                  borderRadius="$3"
                  aria-label={`${bonus.position} ${bonus.statDisplayName} bonus value`}
                />
                <Pressable
                  onPress={() =>
                    void handleRemove(bonus.position, bonus.statDefinitionId)
                  }
                  hitSlop={8}
                  accessibilityLabel={`Remove ${bonus.position} ${bonus.statDisplayName} bonus`}
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
                      ✕
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
              {errorMessage ? (
                <Text fontSize={10} color="$red10">
                  {errorMessage}
                </Text>
              ) : null}
            </YStack>
          );
        })}

        {draft ? (
          <YStack gap="$1">
            <XStack alignItems="center" gap="$2">
              <Pressable
                onPress={cyclePosition}
                hitSlop={8}
                accessibilityRole="button"
                tabIndex={0}
                {...cyclePositionKeyboardProps}
              >
                <XStack
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="$outlineStrong"
                  backgroundColor="$surfaceInteractive"
                  minWidth={48}
                  justifyContent="center"
                >
                  <Text fontSize={12} fontWeight="700" color="$color12">
                    {draft.position}
                  </Text>
                </XStack>
              </Pressable>
              <Pressable
                onPress={cycleStat}
                hitSlop={8}
                style={{ flex: 1 }}
                accessibilityRole="button"
                tabIndex={0}
                {...cycleStatKeyboardProps}
              >
                <XStack
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="$outlineStrong"
                  backgroundColor="$surfaceInteractive"
                >
                  <Text fontSize="$2" color="$color12" numberOfLines={1}>
                    {statById.get(draft.statDefinitionId)?.displayName ?? ''}
                  </Text>
                </XStack>
              </Pressable>
              <Input
                value={draft.value}
                onChangeText={handleDraftValueChange}
                keyboardType="decimal-pad"
                width={64}
                textAlign="right"
                fontSize="$3"
                fontWeight="600"
                borderColor={draftInputError ? '$red8' : '$gray5'}
                borderWidth={1.5}
                borderRadius="$3"
                aria-label="New bonus value"
              />
              <Pressable onPress={cancelDraft} hitSlop={8}>
                <Text fontSize="$2" color="$gray9">
                  Cancel
                </Text>
              </Pressable>
            </XStack>
            {draftInputError ? (
              <Text fontSize={10} color="$red10">
                {draftInputError}
              </Text>
            ) : null}
          </YStack>
        ) : null}

        {saveError ? (
          <Text fontSize="$2" color="$red10">
            {saveError}
          </Text>
        ) : null}

        <Button
          size="$3"
          backgroundColor={
            (canSave || draft) && !draftInputError
              ? '$brandNavyLight'
              : '$gray5'
          }
          borderRadius="$4"
          onPress={() => void handleSave()}
          disabled={(!canSave && !draft) || !!draftInputError}
          opacity={(canSave || draft) && !draftInputError ? 1 : 0.5}
        >
          <Text fontWeight="700" color="white" fontSize="$3">
            {saving ? 'Saving…' : 'Save Bonuses'}
          </Text>
        </Button>
      </YStack>
    </Card>
  );
}
