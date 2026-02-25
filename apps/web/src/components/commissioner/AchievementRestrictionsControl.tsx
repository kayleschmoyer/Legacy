import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Label,
  Separator,
  Spinner,
  Switch,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Award, Check, Trash2 } from '@tamagui/lucide-icons';
import {
  useDeleteAchievementRestrictionMutation,
  useGetAchievementRestrictionsQuery,
  useUpsertAchievementRestrictionMutation,
} from '../../api/db/graphql.generated';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AchievementMeta {
  key: string;
  label: string;
  description: string;
  repeatable: boolean;
}

const ACHIEVEMENT_TYPES: AchievementMeta[] = [
  {
    key: 'all_star_selections',
    label: 'All-Star Selections',
    description: 'Restrict players by number of career All-Star selections',
    repeatable: true,
  },
  {
    key: 'gold_gloves',
    label: 'Gold Gloves',
    description: 'Restrict players by number of Gold Glove awards',
    repeatable: true,
  },
  {
    key: 'silver_sluggers',
    label: 'Silver Sluggers',
    description: 'Restrict players by number of Silver Slugger awards',
    repeatable: true,
  },
  {
    key: 'mvp_awards',
    label: 'MVP Awards',
    description: 'Restrict players by number of MVP awards',
    repeatable: true,
  },
  {
    key: 'cy_young_awards',
    label: 'Cy Young Awards',
    description: 'Restrict players by number of Cy Young awards',
    repeatable: true,
  },
  {
    key: 'world_series_rings',
    label: 'World Series Rings',
    description: 'Restrict players by number of World Series rings',
    repeatable: true,
  },
  {
    key: 'hall_of_fame',
    label: 'Hall of Fame',
    description: 'Restrict the number of Hall of Fame players on a roster',
    repeatable: false,
  },
  {
    key: 'rookie_of_the_year',
    label: 'Rookie of the Year',
    description:
      'Restrict the number of Rookie of the Year winners on a roster',
    repeatable: false,
  },
];

interface RestrictionRowState {
  enabled: boolean;
  playerMinCount: string;
  rosterMin: string;
  rosterMax: string;
  repeatableRosterMax: string;
}

function makeDefaultRowState(): RestrictionRowState {
  return {
    enabled: false,
    playerMinCount: '1',
    rosterMin: '',
    rosterMax: '',
    repeatableRosterMax: '',
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AchievementRestrictionsControlProps {
  leagueId: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AchievementRestrictionsControl — Commissioner UI for configuring per-league
 * roster restrictions based on career achievements (All-Star, Gold Glove, etc.).
 *
 * Each achievement type can be independently enabled or disabled. When enabled,
 * the commissioner can set per-player minimum counts (for repeatable awards) and
 * roster-level min/max limits.
 */
export function AchievementRestrictionsControl({
  leagueId,
  onSuccess,
  onError,
}: AchievementRestrictionsControlProps) {
  const { data, loading: queryLoading } = useGetAchievementRestrictionsQuery({
    variables: { leagueId },
  });

  const [rows, setRows] = useState<Record<string, RestrictionRowState>>(() =>
    Object.fromEntries(
      ACHIEVEMENT_TYPES.map((m) => [m.key, makeDefaultRowState()]),
    ),
  );

  // Hydrate local row state once query data arrives
  useEffect(() => {
    if (!data?.achievementRestrictions) return;
    const next: Record<string, RestrictionRowState> = {};
    for (const meta of ACHIEVEMENT_TYPES) {
      const existing = data.achievementRestrictions.find(
        (r) => r.achievementType === meta.key,
      );
      if (existing) {
        next[meta.key] = {
          enabled: true,
          playerMinCount: String(existing.playerMinCount ?? 1),
          rosterMin:
            existing.rosterMin != null ? String(existing.rosterMin) : '',
          rosterMax:
            existing.rosterMax != null ? String(existing.rosterMax) : '',
          repeatableRosterMax:
            existing.repeatableRosterMax != null
              ? String(existing.repeatableRosterMax)
              : '',
        };
      } else {
        next[meta.key] = makeDefaultRowState();
      }
    }
    setRows(next);
  }, [data]);

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const [upsert] = useUpsertAchievementRestrictionMutation({
    refetchQueries: ['GetAchievementRestrictions'],
    awaitRefetchQueries: true,
  });

  const [remove] = useDeleteAchievementRestrictionMutation();

  const updateRow = useCallback(
    (key: string, patch: Partial<RestrictionRowState>) => {
      setRows((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    [],
  );

  const parseOptionalInt = (s: string): number | null => {
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? null : n;
  };

  const handleSave = async (meta: AchievementMeta) => {
    const row = rows[meta.key];
    if (!row) return;
    setSavingKey(meta.key);
    try {
      await upsert({
        variables: {
          input: {
            leagueId,
            achievementType: meta.key,
            playerMinCount: meta.repeatable
              ? parseOptionalInt(row.playerMinCount)
              : undefined,
            rosterMin: parseOptionalInt(row.rosterMin),
            rosterMax: parseOptionalInt(row.rosterMax),
            repeatableRosterMax: meta.repeatable
              ? parseOptionalInt(row.repeatableRosterMax)
              : undefined,
          },
        },
      });
      setSavedKeys((prev) => new Set([...prev, meta.key]));
      setTimeout(
        () =>
          setSavedKeys((prev) => {
            const next = new Set(prev);
            next.delete(meta.key);
            return next;
          }),
        2500,
      );
      onSuccess?.(`${meta.label} restriction saved`);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (meta: AchievementMeta) => {
    setDeletingKey(meta.key);
    try {
      await remove({
        variables: { leagueId, achievementType: meta.key },
        refetchQueries: ['GetAchievementRestrictions'],
        awaitRefetchQueries: true,
      });
      updateRow(meta.key, makeDefaultRowState());
      onSuccess?.(`${meta.label} restriction removed`);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setDeletingKey(null);
    }
  };

  const existingKeys = new Set(
    data?.achievementRestrictions?.map((r) => r.achievementType) ?? [],
  );

  // ── Render ──

  if (queryLoading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <XStack alignItems="center" gap="$3">
          <Spinner size="small" />
          <Text color="$gray10">Loading achievement restrictions…</Text>
        </XStack>
      </Card>
    );
  }

  const repeatableTypes = ACHIEVEMENT_TYPES.filter((m) => m.repeatable);
  const onceTypes = ACHIEVEMENT_TYPES.filter((m) => !m.repeatable);

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$5">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <Award size={20} color="var(--blue10)" />
          <YStack>
            <H4 margin={0}>Achievement Restrictions</H4>
            <Text fontSize="$2" color="$gray10">
              Limit how many award-winning players each roster can carry. Enable
              a restriction then configure the thresholds below.
            </Text>
          </YStack>
        </XStack>

        {/* Repeatable awards */}
        <YStack gap="$4">
          <Text fontSize="$3" fontWeight="700" color="$color">
            Repeatable Awards
          </Text>
          {repeatableTypes.map((meta) => (
            <AchievementRow
              key={meta.key}
              meta={meta}
              row={rows[meta.key] ?? makeDefaultRowState()}
              isSaving={savingKey === meta.key}
              isDeleting={deletingKey === meta.key}
              justSaved={savedKeys.has(meta.key)}
              hasExisting={existingKeys.has(meta.key)}
              onUpdate={(patch) => updateRow(meta.key, patch)}
              onSave={() => {
                void handleSave(meta);
              }}
              onDelete={() => {
                void handleDelete(meta);
              }}
            />
          ))}
        </YStack>

        <Separator />

        {/* One-time awards */}
        <YStack gap="$4">
          <Text fontSize="$3" fontWeight="700" color="$color">
            One-Time Awards
          </Text>
          {onceTypes.map((meta) => (
            <AchievementRow
              key={meta.key}
              meta={meta}
              row={rows[meta.key] ?? makeDefaultRowState()}
              isSaving={savingKey === meta.key}
              isDeleting={deletingKey === meta.key}
              justSaved={savedKeys.has(meta.key)}
              hasExisting={existingKeys.has(meta.key)}
              onUpdate={(patch) => updateRow(meta.key, patch)}
              onSave={() => {
                void handleSave(meta);
              }}
              onDelete={() => {
                void handleDelete(meta);
              }}
            />
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

interface AchievementRowProps {
  meta: AchievementMeta;
  row: RestrictionRowState;
  isSaving: boolean;
  isDeleting: boolean;
  justSaved: boolean;
  hasExisting: boolean;
  onUpdate: (patch: Partial<RestrictionRowState>) => void;
  onSave: () => void;
  onDelete: () => void;
}

function AchievementRow({
  meta,
  row,
  isSaving,
  isDeleting,
  justSaved,
  hasExisting,
  onUpdate,
  onSave,
  onDelete,
}: AchievementRowProps) {
  return (
    <Card
      backgroundColor="$surfaceCard"
      borderColor={row.enabled ? '$blue6' : '$surfacePanelBorder'}
      borderWidth={1}
      padding="$4"
      borderRadius="$5"
    >
      <YStack gap="$3">
        {/* Title row + toggle */}
        <XStack justifyContent="space-between" alignItems="center">
          <YStack flex={1} gap="$0.5">
            <Text fontSize="$3" fontWeight="700" color="$color">
              {meta.label}
            </Text>
            <Text fontSize="$2" color="$gray10">
              {meta.description}
            </Text>
          </YStack>
          <XStack alignItems="center" gap="$2">
            <Label htmlFor={`switch-${meta.key}`} fontSize="$2" color="$gray10">
              {row.enabled ? 'On' : 'Off'}
            </Label>
            <Switch
              id={`switch-${meta.key}`}
              size="$3"
              checked={row.enabled}
              onCheckedChange={(checked) => onUpdate({ enabled: checked })}
              backgroundColor={row.enabled ? '$blue6' : '$gray4'}
            >
              <Switch.Thumb animation="quicker" />
            </Switch>
          </XStack>
        </XStack>

        {/* Inputs — only shown when enabled */}
        {row.enabled && (
          <YStack gap="$3">
            <XStack gap="$3" flexWrap="wrap">
              {/* playerMinCount — repeatable only */}
              {meta.repeatable && (
                <YStack gap="$1" minWidth={120}>
                  <Text fontSize="$2" fontWeight="600" color="$color">
                    Min. Award Count
                  </Text>
                  <Text fontSize="$1" color="$gray10">
                    Player must have ≥ this many
                  </Text>
                  <Input
                    size="$3"
                    keyboardType="number-pad"
                    value={row.playerMinCount}
                    onChangeText={(v: string) =>
                      onUpdate({ playerMinCount: v })
                    }
                    placeholder="e.g. 3"
                  />
                </YStack>
              )}

              {/* rosterMin */}
              <YStack gap="$1" minWidth={120}>
                <Text fontSize="$2" fontWeight="600" color="$color">
                  Roster Min
                </Text>
                <Text fontSize="$1" color="$gray10">
                  Minimum qualifying players
                </Text>
                <Input
                  size="$3"
                  keyboardType="number-pad"
                  value={row.rosterMin}
                  onChangeText={(v: string) => onUpdate({ rosterMin: v })}
                  placeholder="e.g. 1"
                />
              </YStack>

              {/* rosterMax */}
              <YStack gap="$1" minWidth={120}>
                <Text fontSize="$2" fontWeight="600" color="$color">
                  Roster Max
                </Text>
                <Text fontSize="$1" color="$gray10">
                  Maximum qualifying players
                </Text>
                <Input
                  size="$3"
                  keyboardType="number-pad"
                  value={row.rosterMax}
                  onChangeText={(v: string) => onUpdate({ rosterMax: v })}
                  placeholder="e.g. 5"
                />
              </YStack>

              {/* repeatableRosterMax — repeatable only */}
              {meta.repeatable && (
                <YStack gap="$1" minWidth={120}>
                  <Text fontSize="$2" fontWeight="600" color="$color">
                    Total Award Cap
                  </Text>
                  <Text fontSize="$1" color="$gray10">
                    Max sum across roster
                  </Text>
                  <Input
                    size="$3"
                    keyboardType="number-pad"
                    value={row.repeatableRosterMax}
                    onChangeText={(v: string) =>
                      onUpdate({ repeatableRosterMax: v })
                    }
                    placeholder="e.g. 20"
                  />
                </YStack>
              )}
            </XStack>

            {/* Actions */}
            <XStack gap="$2" justifyContent="flex-end">
              {hasExisting && (
                <Button
                  size="$3"
                  theme="red_alt2"
                  icon={
                    isDeleting ? <Spinner size="small" /> : <Trash2 size={14} />
                  }
                  disabled={isDeleting || isSaving}
                  onPress={onDelete}
                >
                  Remove
                </Button>
              )}
              <Button
                size="$3"
                theme="blue"
                backgroundColor="$blue6"
                borderColor="$blue8"
                icon={
                  isSaving ? (
                    <Spinner size="small" />
                  ) : justSaved ? (
                    <Check size={14} />
                  ) : undefined
                }
                disabled={isSaving || isDeleting}
                onPress={onSave}
              >
                {justSaved ? 'Saved' : 'Save'}
              </Button>
            </XStack>
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
