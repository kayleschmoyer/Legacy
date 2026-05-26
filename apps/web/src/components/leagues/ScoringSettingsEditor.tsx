import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
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
  collectProfileStats,
  createInitialErrors,
  createInitialValues,
  type FieldErrorState,
  FOOTBALL_SCORING_GROUP_ORDER,
  formatMultiplier,
  type FormValueState,
  parseInput,
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

// Per-group accent color overrides for the web editor (hex overrides the
// generic accent strings stored in scoring-profile-utils, which are shared
// with mobile and don't use the web colour constants).
const GROUP_ACCENT_COLOR: Record<string, string> = {
  batting: BRAND_NAVY_LIGHT,
  pitching: GREEN,
  fielding: ORANGE,
  passing: '#8B5CF6',
  rushing: '#14B8A6',
  receiving: '#F59E0B',
  kicking: '#EC4899',
  defense: '#EF4444',
  idp: '#EF4444',
};

const GROUP_GRADIENT_FROM: Record<string, string> = {
  batting: withAlpha(BRAND_NAVY_LIGHT, 0.18),
  pitching: withAlpha(GREEN, 0.18),
  fielding: withAlpha(ORANGE, 0.18),
  passing: withAlpha('#8B5CF6', 0.18),
  rushing: withAlpha('#14B8A6', 0.18),
  receiving: withAlpha('#F59E0B', 0.18),
  kicking: withAlpha('#EC4899', 0.18),
  defense: withAlpha('#EF4444', 0.18),
  idp: withAlpha('#EF4444', 0.18),
};

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

interface ScoringSettingsEditorProps {
  leagueId: number;
  profile: LeagueScoringProfile | null | undefined;
  loading: boolean;
  error?: Error | null;
  onRefetch: () => Promise<void>;
  draftStatus?: string | null;
  /** Sport for the league — determines which stat groups to render. */
  sport?: 'baseball' | 'football' | null;
  /** 'dst' or 'idp' — only meaningful for football leagues. */
  defensiveFormat?: string | null;
}

/**
 * Returns the ordered list of scoring stat groups to display for a league.
 * For baseball, returns the standard SCORING_GROUP_ORDER.
 * For football, returns the football group order filtered by defensive format:
 * 'defense' for DST leagues, 'idp' for IDP leagues.
 *
 * @param sport - 'baseball' or 'football'; non-football falls back to baseball groups.
 * @param defensiveFormat - 'dst' for team defense, 'idp' for individual defensive players,
 *   or null/undefined (defaults to DST for football).
 * @returns Ordered array of group keys suitable for rendering the scoring editor.
 */
export function getGroupOrder(
  sport: string | null | undefined,
  defensiveFormat: string | null | undefined,
): readonly string[] {
  if (sport !== 'football') {
    return SCORING_GROUP_ORDER;
  }

  const isDst = defensiveFormat !== 'idp';
  return FOOTBALL_SCORING_GROUP_ORDER.filter((g) => {
    if (g === 'defense') return isDst;
    if (g === 'idp') return !isDst;
    return true;
  });
}

export function ScoringSettingsEditor(
  props: ScoringSettingsEditorProps,
): React.JSX.Element {
  const {
    leagueId,
    profile,
    loading,
    error,
    onRefetch,
    draftStatus,
    sport,
    defensiveFormat,
  } = props;

  const groupOrder = useMemo(
    () => getGroupOrder(sport, defensiveFormat),
    [sport, defensiveFormat],
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
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [baselineMultipliers, setBaselineMultipliers] = useState<
    Record<number, number>
  >(() => Object.fromEntries(stats.map((s) => [s.id, s.multiplier])));

  const [updateScoring, { loading: saving }] =
    useUpdateLeagueScoringProfileMutation();

  const isSavingRef = useRef(false);
  const skippedSyncRef = useRef(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
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
    () => Object.values(fieldErrors).some((v) => Boolean(v)),
    [fieldErrors],
  );

  const pendingUpdates = useMemo(
    () => valuesToUpdates(stats, formValues),
    [stats, formValues],
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
      setFieldErrors((prev) => ({
        ...prev,
        [statId]: validateStat(stat, nextValue),
      }));
    }
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleResetStat = (statId: number) => {
    const stat = statById.get(statId);
    if (!stat) return;
    setFormValues((prev) => ({
      ...prev,
      [statId]: formatMultiplier(stat.defaultMultiplier),
    }));
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
    if (!canSave) return;

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

    const updatesToSave = pendingUpdates;
    const previousBaseline = baselineMultipliers;
    const previousFormValues = formValues;

    isSavingRef.current = true;

    setBaselineMultipliers((prev) => {
      const next = { ...prev };
      for (const u of updatesToSave) next[u.statDefinitionId] = u.multiplier;
      return next;
    });
    setFormValues((prev) => {
      const next = { ...prev };
      for (const u of updatesToSave)
        next[u.statDefinitionId] = formatMultiplier(u.multiplier);
      return next;
    });

    try {
      await updateScoring({ variables: { leagueId, updates: updatesToSave } });
      await onRefetch();
      setSaveSuccess(true);
      setSaveError(null);
    } catch (mutationError) {
      setBaselineMultipliers(previousBaseline);
      setFormValues(previousFormValues);
      setSaveSuccess(false);
      LOGGER.error(
        'Failed to update scoring multipliers',
        mutationError instanceof Error
          ? mutationError
          : new Error(String(mutationError)),
        { leagueId },
      );
      setSaveError('Failed to update scoring multipliers. Please try again.');
    } finally {
      isSavingRef.current = false;
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
        <XStack width={4} flexShrink={0} />

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
      groupOrder.reduce<Record<string, boolean>>(
        (acc, g) => ({ ...acc, [g]: true }),
        {},
      ),
  );

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <YStack
      data-testid="scoring-editor"
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
              Failed to load scoring profile.
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
          ? groupOrder.map((group) => {
              const statsForGroup = groupedStats[group];
              if (!statsForGroup || statsForGroup.length === 0) return null;

              const copy = SCORING_GROUP_COPY[group];
              if (!copy) return null;

              const accent = GROUP_ACCENT_COLOR[group] ?? BRAND_NAVY_LIGHT;
              const gradientFrom =
                GROUP_GRADIENT_FROM[group] ?? withAlpha(BRAND_NAVY_LIGHT, 0.18);

              const isExpanded = expandedGroups[group] !== false;
              const overrideCount = statsForGroup.filter(
                (s) => Math.abs(s.multiplier - s.defaultMultiplier) > 0.0001,
              ).length;

              // Special label for group tag
              const isDstGroup = group === 'defense';
              const isIdpGroup = group === 'idp';

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
                    background: `linear-gradient(180deg, ${gradientFrom} 0%, transparent 40%)`,
                    boxShadow: `0 2px 12px ${withAlpha(BLACK, 0.15)}`,
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  <XStack
                    data-testid={`scoring-group-header-${group}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-label={`${copy.title} scoring group`}
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    alignItems="center"
                    gap="$3"
                    cursor="pointer"
                    onPress={() => toggleGroup(group)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleGroup(group);
                      }
                    }}
                    hoverStyle={{ backgroundColor: '$backgroundHover' }}
                    pressStyle={{ opacity: 0.85 }}
                    animation="quick"
                  >
                    <XStack
                      width={4}
                      height={28}
                      borderRadius={2}
                      backgroundColor={accent}
                      style={{ boxShadow: `0 0 8px ${gradientFrom}` }}
                    />
                    <YStack flex={1}>
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize="$4" fontWeight="700" color="$color12">
                          {copy.title}
                        </Text>
                        {(isDstGroup || isIdpGroup) && (
                          <XStack
                            paddingHorizontal={6}
                            paddingVertical={1}
                            borderRadius="$10"
                            backgroundColor={withAlpha(accent, 0.15)}
                          >
                            <Text fontSize={9} fontWeight="700" color={accent}>
                              {isDstGroup ? 'D/ST' : 'IDP'}
                            </Text>
                          </XStack>
                        )}
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

        {/* Action bar */}
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
                  role="status"
                  aria-live="polite"
                  animation="quick"
                  enterStyle={{ opacity: 0, y: -4 }}
                  exitStyle={{ opacity: 0, y: -4 }}
                  alignItems="center"
                  gap="$2"
                >
                  <span
                    data-testid="scoring-saved-toast"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Zap size={14} color="$green10" />
                    <Text fontSize="$2" color="$green10" fontWeight="600">
                      Changes saved — scoring table refreshed.
                    </Text>
                  </span>
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
