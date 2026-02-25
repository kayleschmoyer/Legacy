import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, H4, Spinner, Text, XStack, YStack } from 'tamagui';
import { Check, Lock, Settings } from '@tamagui/lucide-icons';
import {
  DRAFT_MODES,
  DRAFT_ORDERS,
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
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
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
  onSuccess,
  onError,
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
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state from server data
  useEffect(() => {
    if (draftData?.getLeagueDraft) {
      const draft = draftData.getLeagueDraft;
      setDraftMode(String(draft.draftMode ?? 'live'));
      setSelectionMethod(String(draft.selectionMethod ?? 'standard'));
      setDraftOrder(String(draft.draftOrder ?? 'snake'));
    }
  }, [draftData]);

  useEffect(() => {
    if (leaguePlayerPool) {
      setPlayerPool(leaguePlayerPool);
    }
  }, [leaguePlayerPool]);

  // Track changes
  const checkChanges = useCallback(
    (dm: string, sm: string, dor: string, pp: string) => {
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

      setHasChanges(
        dm !== originalDraftMode ||
          sm !== originalSelectionMethod ||
          dor !== originalDraftOrder ||
          pp !== originalPlayerPool,
      );
    },
    [draftData, leaguePlayerPool],
  );

  const handleDraftModeChange = (value: string) => {
    setDraftMode(value);
    // Automated drafts only support 'random' selection method
    if (value === 'automated') {
      setSelectionMethod('random');
      checkChanges(value, 'random', draftOrder, playerPool);
    } else {
      checkChanges(value, selectionMethod, draftOrder, playerPool);
    }
  };

  const handleSelectionMethodChange = (value: string) => {
    setSelectionMethod(value);
    checkChanges(draftMode, value, draftOrder, playerPool);
  };

  const handleDraftOrderChange = (value: string) => {
    setDraftOrder(value);
    checkChanges(draftMode, selectionMethod, value, playerPool);
  };

  const handlePlayerPoolChange = (value: string) => {
    setPlayerPool(value);
    checkChanges(draftMode, selectionMethod, draftOrder, value);
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

    setDraftMode(originalDraftMode);
    setSelectionMethod(originalSelectionMethod);
    setDraftOrder(originalDraftOrder);
    setPlayerPool(originalPlayerPool);
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
