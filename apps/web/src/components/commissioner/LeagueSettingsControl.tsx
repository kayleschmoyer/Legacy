import React, { useCallback, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle, Check, Settings } from '@tamagui/lucide-icons';
import { useUpdateLeagueSettingsMutation } from '../../api/db/graphql.generated';

export interface LeagueSettingsControlProps {
  leagueId: number;
  currentGamesPerMatchup: number;
  currentSpStartsPerMatchup: number;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

const GAMES_PER_MATCHUP_OPTIONS = [
  { label: '1 game', value: 1 },
  { label: '2 games', value: 2 },
  { label: '3 games', value: 3 },
  { label: '4 games', value: 4 },
  { label: '5 games', value: 5 },
  { label: '6 games', value: 6 },
  { label: '7 games', value: 7 },
] as const;

/**
 * LeagueSettingsControl — Commissioner control for league-level matchup settings.
 *
 * Manages games per matchup and SP starts per matchup. SP starts cannot exceed
 * games per matchup. Changes propagate to scheduled matchups.
 */
export function LeagueSettingsControl({
  leagueId,
  currentGamesPerMatchup,
  currentSpStartsPerMatchup,
  onSuccess,
  onError,
}: LeagueSettingsControlProps) {
  const [gamesPerMatchup, setGamesPerMatchup] = useState(
    currentGamesPerMatchup,
  );
  const [spStarts, setSpStarts] = useState(currentSpStartsPerMatchup);
  const [hasChanges, setHasChanges] = useState(false);

  const [updateLeagueSettings, { loading: saving }] =
    useUpdateLeagueSettingsMutation();

  const checkChanges = useCallback(
    (games: number, starts: number) => {
      setHasChanges(
        games !== currentGamesPerMatchup ||
          starts !== currentSpStartsPerMatchup,
      );
    },
    [currentGamesPerMatchup, currentSpStartsPerMatchup],
  );

  const handleGamesChange = useCallback(
    (value: number) => {
      setGamesPerMatchup(value);
      // If SP starts exceed the new games count, clamp it down
      const clampedStarts = Math.min(spStarts, value);
      setSpStarts(clampedStarts);
      checkChanges(value, clampedStarts);
    },
    [spStarts, checkChanges],
  );

  const handleSpStartsChange = useCallback(
    (value: number) => {
      setSpStarts(value);
      checkChanges(gamesPerMatchup, value);
    },
    [gamesPerMatchup, checkChanges],
  );

  const validationError =
    spStarts > gamesPerMatchup
      ? `SP starts (${spStarts}) cannot exceed games per matchup (${gamesPerMatchup})`
      : null;

  const handleSave = async () => {
    if (validationError) return;

    try {
      await updateLeagueSettings({
        variables: {
          input: {
            leagueId,
            gamesPerMatchup,
            spStartsPerMatchup: spStarts,
          },
        },
        refetchQueries: ['GetLeagueById'],
        awaitRefetchQueries: true,
      });

      setHasChanges(false);
      onSuccess?.('League settings saved successfully!');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  const handleReset = () => {
    setGamesPerMatchup(currentGamesPerMatchup);
    setSpStarts(currentSpStartsPerMatchup);
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
        <XStack alignItems="center" gap="$2">
          <Settings size={20} color="var(--blue10)" />
          <YStack>
            <H4 margin={0}>League Settings</H4>
            <Text fontSize="$2" color="$gray10">
              Configure matchup settings for the league. Changes apply to future
              scheduled matchups.
            </Text>
          </YStack>
        </XStack>

        {/* Games Per Matchup */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Games Per Matchup
            </Text>
            <Text fontSize="$2" color="$gray10">
              Total number of games in each matchup week. All non-pitcher and RP
              players play every game. Changes apply to scheduled matchups only.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {GAMES_PER_MATCHUP_OPTIONS.map((option) => {
              const isSelected = gamesPerMatchup === option.value;
              return (
                <Button
                  key={option.value}
                  size="$3"
                  theme={isSelected ? 'active' : 'alt2'}
                  backgroundColor={isSelected ? '$blue6' : '$gray3'}
                  borderColor={isSelected ? '$blue8' : '$gray6'}
                  borderWidth={1}
                  borderRadius="$3"
                  onPress={() => handleGamesChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Games per matchup: ${option.label}`}
                  hoverStyle={
                    saving
                      ? undefined
                      : {
                          backgroundColor: isSelected ? '$blue7' : '$gray4',
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

        <Separator />

        {/* SP Starts Per Matchup */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              SP Starts Per Matchup
            </Text>
            <Text fontSize="$2" color="$gray10">
              How many games starting pitchers play each matchup (cannot exceed
              games per matchup). Relief pitchers always play every game.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {GAMES_PER_MATCHUP_OPTIONS.filter(
              (o) => o.value <= gamesPerMatchup,
            ).map((option) => {
              const isSelected = spStarts === option.value;
              return (
                <Button
                  key={option.value}
                  size="$3"
                  theme={isSelected ? 'active' : 'alt2'}
                  backgroundColor={isSelected ? '$blue6' : '$gray3'}
                  borderColor={isSelected ? '$blue8' : '$gray6'}
                  borderWidth={1}
                  borderRadius="$3"
                  onPress={() => handleSpStartsChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`SP starts per matchup: ${option.label}`}
                  hoverStyle={
                    saving
                      ? undefined
                      : {
                          backgroundColor: isSelected ? '$blue7' : '$gray4',
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

        {/* Validation warning */}
        {validationError && (
          <Card
            backgroundColor="$yellow2"
            borderColor="$yellow6"
            padding="$3"
            borderRadius="$4"
          >
            <XStack alignItems="center" gap="$2">
              <AlertTriangle size={16} color="var(--yellow11)" />
              <Text fontSize="$3" color="$yellow11" fontWeight="600">
                {validationError}
              </Text>
            </XStack>
          </Card>
        )}

        {/* Action buttons */}
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
            disabled={!hasChanges || saving || !!validationError}
            opacity={!hasChanges || !!validationError ? 0.5 : 1}
            icon={saving ? <Spinner size="small" /> : undefined}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
