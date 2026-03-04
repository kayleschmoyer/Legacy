import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, H4, Spinner, Text, XStack, YStack } from 'tamagui';
import { Check, Lock, Settings } from '@tamagui/lucide-icons';
import {
  DRAFT_MODES,
  DRAFT_ORDERS,
  ERA_FILTERS,
  PLAYER_POOLS,
  SELECTION_METHODS,
} from '@legacy-sports/shared-components';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';
import {
  useGetLeagueDraftQuery,
  useUpdateDraftSettingsMutation,
} from '../../api/db/graphql.generated';

export interface DraftSettingsControlProps {
  leagueId: number;
  draftStatus: string | null | undefined;
  playerPool: string | null | undefined;
  /** Current era filter for the league (editable before draft starts). */
  eraFilter?: string | null | undefined;
  hofOnly?: boolean | null | undefined;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
  /** Called whenever the unsaved-changes state changes. Used by parents to
   * block the "Start Draft" button while settings are dirty. */
  onDirtyChange?: (isDirty: boolean) => void;
}

interface SettingOption {
  label: string;
  value: string;
}

function OptionSelector({
  label,
  description,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  options: readonly SettingOption[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <YStack gap="$2">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600" color="$color">
          {label}
        </Text>
        <Text fontSize="$2" color="$gray10">
          {description}
        </Text>
      </YStack>
      <XStack gap="$2" flexWrap="wrap">
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Button
              key={option.value}
              size="$3"
              theme={isSelected ? 'active' : 'alt2'}
              backgroundColor={
                isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
              }
              borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
              borderWidth={1}
              borderRadius="$3"
              onPress={() => onChange(option.value)}
              disabled={disabled}
              opacity={disabled ? 0.5 : 1}
              icon={isSelected ? <Check size={14} /> : undefined}
              aria-pressed={isSelected}
              aria-label={`${label}: ${option.label}`}
              hoverStyle={
                disabled
                  ? undefined
                  : {
                      backgroundColor: isSelected
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                        : '$gray4',
                    }
              }
            >
              <Text
                fontSize="$2"
                fontWeight={isSelected ? '700' : '400'}
                color={isSelected ? 'white' : '$color'}
              >
                {option.label}
              </Text>
            </Button>
          );
        })}
      </XStack>
    </YStack>
  );
}

/**
 * DraftSettingsControl — Commissioner control for editing draft settings.
 *
 * Allows editing draft mode, selection method, draft order, and player pool
 * **only** while the draft status is `not-started`. Once the draft is queued,
 * in-progress, or completed the controls are locked.
 */
export function DraftSettingsControl({
  leagueId,
  draftStatus,
  playerPool: leaguePlayerPool,
  eraFilter,
  hofOnly,
  onSuccess,
  onError,
  onDirtyChange,
}: DraftSettingsControlProps) {
  const isDraftLocked = draftStatus !== 'not-started';

  // Fetch the current draft record (if any)
  const {
    data: draftData,
    loading: draftLoading,
    refetch: refetchDraft,
  } = useGetLeagueDraftQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });

  const [updateDraftSettings, { loading: saving }] =
    useUpdateDraftSettingsMutation();

  // Local form state
  const [draftMode, setDraftMode] = useState('live');
  const [selectionMethod, setSelectionMethod] = useState('standard');
  const [draftOrder, setDraftOrder] = useState('snake');
  const [playerPool, setPlayerPool] = useState('all');
  const [eraFilterLocal, setEraFilterLocal] = useState('all');
  const [hofOnlyLocal, setHofOnlyLocal] = useState(false);
  /** ISO-8601 string (YYYY-MM-DDTHH:MM) for the datetime-local input, or '' for no schedule */
  const [scheduledAt, setScheduledAt] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  // Sync local state from server data
  useEffect(() => {
    if (draftData?.getLeagueDraft) {
      const draft = draftData.getLeagueDraft;
      setDraftMode(String(draft.draftMode ?? 'live'));
      setSelectionMethod(String(draft.selectionMethod ?? 'standard'));
      setDraftOrder(String(draft.draftOrder ?? 'snake'));
      // Sync scheduledAt: convert ISO-8601 to datetime-local (UTC slice for input)
      setScheduledAt(
        draft.scheduledAt
          ? new Date(draft.scheduledAt).toISOString().slice(0, 16)
          : '',
      );
    }
  }, [draftData]);

  useEffect(() => {
    if (leaguePlayerPool) {
      setPlayerPool(leaguePlayerPool);
    }
  }, [leaguePlayerPool]);

  useEffect(() => {
    setEraFilterLocal(eraFilter ?? 'all');
  }, [eraFilter]);

  useEffect(() => {
    setHofOnlyLocal(hofOnly ?? false);
  }, [hofOnly]);

  // Track changes
  const checkChanges = useCallback(
    (
      dm: string,
      sm: string,
      dor: string,
      pp: string,
      ef: string,
      hof: boolean,
      sa: string,
    ) => {
      const originalDraftMode = String(
        draftData?.getLeagueDraft?.draftMode ?? 'live',
      );
      const originalSelectionMethod = String(
        draftData?.getLeagueDraft?.selectionMethod ?? 'standard',
      );
      const originalDraftOrder = String(
        draftData?.getLeagueDraft?.draftOrder ?? 'snake',
      );
      const originalPlayerPool = String(leaguePlayerPool ?? 'all');
      const originalEraFilter = String(eraFilter ?? 'all');
      const originalHofOnly = hofOnly ?? false;
      const originalScheduledAt = draftData?.getLeagueDraft?.scheduledAt
        ? new Date(draftData.getLeagueDraft.scheduledAt)
            .toISOString()
            .slice(0, 16)
        : '';

      setHasChanges(
        dm !== originalDraftMode ||
          sm !== originalSelectionMethod ||
          dor !== originalDraftOrder ||
          pp !== originalPlayerPool ||
          ef !== originalEraFilter ||
          hof !== originalHofOnly ||
          sa !== originalScheduledAt,
      );
    },
    [draftData, leaguePlayerPool, eraFilter, hofOnly],
  );

  const handleDraftModeChange = (value: string) => {
    setDraftMode(value);
    // Automated drafts only support 'random' selection method
    if (value === 'automated') {
      setSelectionMethod('random');
      checkChanges(
        value,
        'random',
        draftOrder,
        playerPool,
        eraFilterLocal,
        hofOnlyLocal,
        scheduledAt,
      );
    } else {
      checkChanges(
        value,
        selectionMethod,
        draftOrder,
        playerPool,
        eraFilterLocal,
        hofOnlyLocal,
        scheduledAt,
      );
    }
  };

  const handleSelectionMethodChange = (value: string) => {
    setSelectionMethod(value);
    checkChanges(
      draftMode,
      value,
      draftOrder,
      playerPool,
      eraFilterLocal,
      hofOnlyLocal,
      scheduledAt,
    );
  };

  const handleDraftOrderChange = (value: string) => {
    setDraftOrder(value);
    checkChanges(
      draftMode,
      selectionMethod,
      value,
      playerPool,
      eraFilterLocal,
      hofOnlyLocal,
      scheduledAt,
    );
  };

  const handlePlayerPoolChange = (value: string) => {
    setPlayerPool(value);
    checkChanges(
      draftMode,
      selectionMethod,
      draftOrder,
      value,
      eraFilterLocal,
      hofOnlyLocal,
      scheduledAt,
    );
  };

  const handleEraFilterChange = (value: string) => {
    setEraFilterLocal(value);
    checkChanges(
      draftMode,
      selectionMethod,
      draftOrder,
      playerPool,
      value,
      hofOnlyLocal,
      scheduledAt,
    );
  };

  const handleHofOnlyChange = (value: boolean) => {
    setHofOnlyLocal(value);
    checkChanges(
      draftMode,
      selectionMethod,
      draftOrder,
      playerPool,
      eraFilterLocal,
      value,
      scheduledAt,
    );
  };

  /** Handle draft schedule datetime change (LS-423) */
  const handleScheduledAtChange = (value: string) => {
    setScheduledAt(value);
    checkChanges(
      draftMode,
      selectionMethod,
      draftOrder,
      playerPool,
      eraFilterLocal,
      hofOnlyLocal,
      value,
    );
  };

  const handleSave = async () => {
    try {
      await updateDraftSettings({
        variables: {
          input: {
            leagueId,
            draftMode,
            selectionMethod,
            draftOrder,
            playerPool,
            eraFilter: eraFilterLocal,
            hofOnly: hofOnlyLocal,
            // LS-423: send null to clear the schedule, ISO-8601 string to set it
            scheduledAt: scheduledAt
              ? new Date(scheduledAt).toISOString()
              : null,
          },
        },
        refetchQueries: ['GetLeagueById', 'GetLeagueDraft'],
        awaitRefetchQueries: true,
      });

      setHasChanges(false);
      onSuccess?.('Draft settings saved successfully!');
      void refetchDraft();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  const handleReset = () => {
    const originalDraftMode = String(
      draftData?.getLeagueDraft?.draftMode ?? 'live',
    );
    const originalSelectionMethod = String(
      draftData?.getLeagueDraft?.selectionMethod ?? 'standard',
    );
    const originalDraftOrder = String(
      draftData?.getLeagueDraft?.draftOrder ?? 'snake',
    );
    const originalPlayerPool = String(leaguePlayerPool ?? 'all');
    const originalScheduledAt = draftData?.getLeagueDraft?.scheduledAt
      ? new Date(draftData.getLeagueDraft.scheduledAt)
          .toISOString()
          .slice(0, 16)
      : '';

    setDraftMode(originalDraftMode);
    setSelectionMethod(originalSelectionMethod);
    setDraftOrder(originalDraftOrder);
    setPlayerPool(originalPlayerPool);
    setEraFilterLocal(eraFilter ?? 'all');
    setHofOnlyLocal(hofOnly ?? false);
    setScheduledAt(originalScheduledAt);
    setHasChanges(false);
  };

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            {isDraftLocked ? (
              <Lock size={20} color="var(--gray10)" />
            ) : (
              <Settings size={20} color={BRAND_NAVY_LIGHT} />
            )}
            <YStack>
              <H4 margin={0}>Draft Settings</H4>
              <Text fontSize="$2" color="$gray10">
                {isDraftLocked
                  ? 'Settings are locked — the draft has already been started.'
                  : 'Configure your draft before it begins. Settings lock once the draft starts.'}
              </Text>
            </YStack>
          </XStack>
        </XStack>

        {/* Locked banner */}
        {isDraftLocked && (
          <Card
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            padding="$3"
            borderRadius="$4"
          >
            <XStack alignItems="center" gap="$2">
              <Lock size={16} color="var(--yellow11)" />
              <Text fontSize="$3" color="$yellow11" fontWeight="600">
                Draft settings are locked because the draft status is &ldquo;
                {draftStatus}&rdquo;. Settings can only be changed before the
                draft is started.
              </Text>
            </XStack>
          </Card>
        )}

        {draftLoading ? (
          <YStack alignItems="center" padding="$4" gap="$2">
            <Spinner size="large" />
            <Text color="$gray10">Loading draft settings...</Text>
          </YStack>
        ) : (
          <YStack gap="$5">
            {/* Draft Mode */}
            <OptionSelector
              label="Draft Mode"
              description="Live drafts happen in real-time with all managers picking. Automated drafts are processed instantly by the system."
              options={DRAFT_MODES}
              value={draftMode}
              onChange={handleDraftModeChange}
              disabled={isDraftLocked || saving}
            />

            {/* Selection Method */}
            <OptionSelector
              label="Selection Method"
              description={
                draftMode === 'automated'
                  ? "Automated drafts use random player assignment. Switch to 'Live Draft' to choose a different method."
                  : 'Standard lets managers pick players in order. Auction gives a budget for bidding. Random assigns players automatically.'
              }
              options={SELECTION_METHODS}
              value={selectionMethod}
              onChange={handleSelectionMethodChange}
              disabled={isDraftLocked || saving || draftMode === 'automated'}
            />

            {/* Draft Order */}
            <OptionSelector
              label="Draft Order"
              description="Snake reverses pick order each round (1-2-3, 3-2-1). Linear keeps the same order every round."
              options={DRAFT_ORDERS}
              value={draftOrder}
              onChange={handleDraftOrderChange}
              disabled={isDraftLocked || saving}
            />

            {/* Player Pool */}
            <OptionSelector
              label="Player Pool"
              description="Choose which players are available to draft. All MLB includes every player; or limit to one league."
              options={PLAYER_POOLS}
              value={playerPool}
              onChange={handlePlayerPoolChange}
              disabled={isDraftLocked || saving}
            />

            {/* Era Filter */}
            <OptionSelector
              label="Historical Era Filter"
              description="Restrict the draft pool to players from a specific baseball era. Change before the draft starts."
              options={ERA_FILTERS}
              value={eraFilterLocal}
              onChange={handleEraFilterChange}
              disabled={isDraftLocked || saving}
            />

            {/* Hall of Fame Only */}
            <YStack gap="$2">
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Hall of Fame Only
                </Text>
                <Text fontSize="$2" color="$gray10">
                  When enabled, only Baseball Hall of Fame inductees can be
                  drafted.
                </Text>
              </YStack>
              <XStack gap="$2">
                {[
                  { label: 'Off', value: false },
                  { label: 'On', value: true },
                ].map((opt) => {
                  const isSelected = hofOnlyLocal === opt.value;
                  return (
                    <Button
                      key={String(opt.value)}
                      size="$3"
                      theme={isSelected ? 'active' : 'alt2'}
                      backgroundColor={
                        isSelected
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
                          : '$gray3'
                      }
                      borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
                      borderWidth={1}
                      onPress={() => {
                        handleHofOnlyChange(opt.value);
                      }}
                      disabled={isDraftLocked || saving}
                    >
                      <Text
                        fontWeight={isSelected ? '600' : '400'}
                        color={isSelected ? '$color' : '$gray10'}
                      >
                        {opt.label}
                      </Text>
                    </Button>
                  );
                })}
              </XStack>
            </YStack>

            {/* Draft Schedule (LS-423) */}
            <YStack gap="$2">
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Scheduled Start Time
                </Text>
                <Text fontSize="$2" color="$gray10">
                  Set a date and time for the draft to automatically begin. The
                  draft room opens 30 minutes before. Leave blank for manual
                  start. All times are in UTC.
                </Text>
              </YStack>
              <XStack gap="$2" alignItems="center">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  disabled={isDraftLocked || saving}
                  onChange={(e) => {
                    handleScheduledAtChange(e.target.value);
                  }}
                  style={{
                    background: isDraftLocked ? 'var(--gray3)' : 'var(--gray3)',
                    border: `1px solid ${scheduledAt ? BRAND_NAVY_LIGHT : 'var(--gray6)'}`,
                    borderRadius: 8,
                    color: isDraftLocked ? 'var(--gray10)' : 'var(--color)',
                    fontSize: 13,
                    opacity: isDraftLocked || saving ? 0.5 : 1,
                    padding: '6px 10px',
                    cursor: isDraftLocked ? 'not-allowed' : 'default',
                  }}
                />
                {scheduledAt && !isDraftLocked && (
                  <Button
                    size="$2"
                    theme="alt2"
                    onPress={() => {
                      handleScheduledAtChange('');
                    }}
                    disabled={saving}
                  >
                    <Text fontSize="$2" color="$gray10">
                      Clear
                    </Text>
                  </Button>
                )}
              </XStack>
              {scheduledAt && (
                <Text fontSize="$2" color="$blue10">
                  Draft room opens at{' '}
                  {new Date(
                    new Date(scheduledAt).getTime() - 30 * 60 * 1000,
                  ).toLocaleString('en-US', { timeZoneName: 'short' })}
                  {' — '}draft starts at{' '}
                  {new Date(scheduledAt).toLocaleString('en-US', {
                    timeZoneName: 'short',
                  })}
                </Text>
              )}
            </YStack>

            {/* Action buttons */}
            {!isDraftLocked && (
              <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap">
                <Button
                  theme="alt2"
                  size="$3"
                  onPress={handleReset}
                  disabled={!hasChanges || saving}
                  opacity={!hasChanges ? 0.5 : 1}
                >
                  Reset
                </Button>
                <Button
                  theme="blue"
                  size="$3"
                  onPress={() => void handleSave()}
                  disabled={!hasChanges || saving}
                  opacity={!hasChanges ? 0.5 : 1}
                  icon={saving ? <Spinner size="small" /> : undefined}
                >
                  {saving ? 'Saving...' : 'Save Draft Settings'}
                </Button>
              </XStack>
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
