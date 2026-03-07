import React, { useCallback, useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { AlertTriangle, Check, Settings } from '@tamagui/lucide-icons';
import { useUpdateLeagueSettingsMutation } from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';

export interface LeagueSettingsControlProps {
  leagueId: number;
  currentGamesPerMatchup: number;
  currentSpStartsPerMatchup: number;
  currentMinCareerGames?: number;
  currentMinCareerSeasons?: number;
  currentTotalMatchups?: number;
  currentPlayoffEnabled?: boolean;
  currentPlayoffFormat?: string;
  currentPlayoffMultiWeek?: boolean;
  // Salary cap settings (LS-646)
  currentSalaryCapEnabled?: boolean;
  currentSalaryCap?: number | null;
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

const MIN_CAREER_GAMES_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '75', value: 75 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
] as const;

const MIN_CAREER_SEASONS_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '7', value: 7 },
] as const;

const TOTAL_MATCHUPS_OPTIONS = [
  { label: '5', value: 5 },
  { label: '8', value: 8 },
  { label: '10', value: 10 },
  { label: '12', value: 12 },
  { label: '15', value: 15 },
  { label: '20', value: 20 },
] as const;

const PLAYOFF_FORMAT_OPTIONS = [
  { label: '4-team', value: '4-team' },
  { label: '6-team', value: '6-team' },
  { label: '8-team', value: '8-team' },
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
  currentMinCareerGames = 50,
  currentMinCareerSeasons = 3,
  currentTotalMatchups = 10,
  currentPlayoffEnabled = true,
  currentPlayoffFormat = '4-team',
  currentPlayoffMultiWeek = false,
  currentSalaryCapEnabled = false,
  currentSalaryCap = null,
  onSuccess,
  onError,
}: LeagueSettingsControlProps) {
  const [gamesPerMatchup, setGamesPerMatchup] = useState(
    currentGamesPerMatchup,
  );
  const [spStarts, setSpStarts] = useState(currentSpStartsPerMatchup);
  const [minCareerGames, setMinCareerGames] = useState(currentMinCareerGames);
  const [minCareerSeasons, setMinCareerSeasons] = useState(
    currentMinCareerSeasons,
  );
  const [totalMatchups, setTotalMatchups] = useState(currentTotalMatchups);
  const [playoffEnabled, setPlayoffEnabled] = useState(currentPlayoffEnabled);
  const [playoffFormat, setPlayoffFormat] = useState(currentPlayoffFormat);
  const [playoffMultiWeek, setPlayoffMultiWeek] = useState(
    currentPlayoffMultiWeek,
  );
  const [salaryCapEnabled, setSalaryCapEnabled] = useState(
    currentSalaryCapEnabled,
  );
  const [salaryCap, setSalaryCap] = useState<number | null | undefined>(
    currentSalaryCap,
  );
  const [hasChanges, setHasChanges] = useState(false);

  const [updateLeagueSettings, { loading: saving }] =
    useUpdateLeagueSettingsMutation();

  const checkChanges = useCallback(
    (
      games: number,
      starts: number,
      careerGames: number,
      careerSeasons: number,
      totMatchups: number,
      poEnabled: boolean,
      poFormat: string,
      poMultiWeek: boolean,
    ) => {
      setHasChanges(
        games !== currentGamesPerMatchup ||
          starts !== currentSpStartsPerMatchup ||
          careerGames !== currentMinCareerGames ||
          careerSeasons !== currentMinCareerSeasons ||
          totMatchups !== currentTotalMatchups ||
          poEnabled !== currentPlayoffEnabled ||
          poFormat !== currentPlayoffFormat ||
          poMultiWeek !== currentPlayoffMultiWeek,
      );
    },
    [
      currentGamesPerMatchup,
      currentSpStartsPerMatchup,
      currentMinCareerGames,
      currentMinCareerSeasons,
      currentTotalMatchups,
      currentPlayoffEnabled,
      currentPlayoffFormat,
      currentPlayoffMultiWeek,
    ],
  );

  const handleGamesChange = useCallback(
    (value: number) => {
      setGamesPerMatchup(value);
      // If SP starts exceed the new games count, clamp it down
      const clampedStarts = Math.min(spStarts, value);
      setSpStarts(clampedStarts);
      checkChanges(
        value,
        clampedStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      spStarts,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handleSpStartsChange = useCallback(
    (value: number) => {
      setSpStarts(value);
      checkChanges(
        gamesPerMatchup,
        value,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handleMinCareerGamesChange = useCallback(
    (value: number) => {
      setMinCareerGames(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        value,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handleMinCareerSeasonsChange = useCallback(
    (value: number) => {
      setMinCareerSeasons(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        value,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handleTotalMatchupsChange = useCallback(
    (value: number) => {
      setTotalMatchups(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        value,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      minCareerSeasons,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handlePlayoffEnabledChange = useCallback(
    (value: boolean) => {
      setPlayoffEnabled(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        value,
        playoffFormat,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffFormat,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handlePlayoffFormatChange = useCallback(
    (value: string) => {
      setPlayoffFormat(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        value,
        playoffMultiWeek,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffMultiWeek,
      checkChanges,
    ],
  );

  const handlePlayoffMultiWeekChange = useCallback(
    (value: boolean) => {
      setPlayoffMultiWeek(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        value,
      );
    },
    [
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      checkChanges,
    ],
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
            minCareerGames,
            minCareerSeasons,
            totalMatchups,
            playoffEnabled,
            playoffFormat,
            playoffMultiWeek,
            salaryCapEnabled,
            salaryCap: salaryCapEnabled ? salaryCap : null,
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
    setMinCareerGames(currentMinCareerGames);
    setMinCareerSeasons(currentMinCareerSeasons);
    setTotalMatchups(currentTotalMatchups);
    setPlayoffEnabled(currentPlayoffEnabled);
    setPlayoffFormat(currentPlayoffFormat);
    setPlayoffMultiWeek(currentPlayoffMultiWeek);
    setSalaryCapEnabled(currentSalaryCapEnabled);
    setSalaryCap(currentSalaryCap);
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
          <Settings size={20} color={BRAND_NAVY_LIGHT} />
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
                  backgroundColor={
                    isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
                  }
                  borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
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
                  backgroundColor={
                    isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
                  }
                  borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
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

        <Separator />

        {/* Min Career Games */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Minimum Career Games
            </Text>
            <Text fontSize="$2" color="$gray10">
              Players with fewer career MLB games than this threshold are
              excluded from the draft pool, free agent pool, and cannot hold a
              starting roster spot. Set to "Off" to disable.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {MIN_CAREER_GAMES_OPTIONS.map((option) => {
              const isSelected = minCareerGames === option.value;
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
                  onPress={() => handleMinCareerGamesChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Minimum career games: ${option.label}`}
                  hoverStyle={
                    saving
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

        <Separator />

        {/* Min Career Seasons */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Minimum Career Seasons
            </Text>
            <Text fontSize="$2" color="$gray10">
              Players with fewer distinct MLB seasons (AL/NL) than this
              threshold are excluded from the draft pool, free agent pool, and
              cannot hold a starting roster spot. Set to "Off" to disable.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {MIN_CAREER_SEASONS_OPTIONS.map((option) => {
              const isSelected = minCareerSeasons === option.value;
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
                  onPress={() => handleMinCareerSeasonsChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Minimum career seasons: ${option.label}`}
                  hoverStyle={
                    saving
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

        <Separator />

        {/* Total Matchups */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Total Matchups
            </Text>
            <Text fontSize="$2" color="$gray10">
              Total number of matchup weeks in a season. Adding weeks creates
              new scheduled matchups. Removing weeks only removes future
              unplayed (scheduled) matchups.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {TOTAL_MATCHUPS_OPTIONS.map((option) => {
              const isSelected = totalMatchups === option.value;
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
                  onPress={() => handleTotalMatchupsChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Total matchups: ${option.label}`}
                  hoverStyle={
                    saving
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

        <Separator />

        {/* Playoff Settings */}
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600" color="$color">
              Playoffs
            </Text>
            <Text fontSize="$2" color="$gray10">
              Enable a playoff bracket at the end of the regular season. The
              bracket is created automatically after the final matchup week.
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {(
              [
                { label: 'Enabled', value: true },
                { label: 'Disabled', value: false },
              ] as const
            ).map((option) => {
              const isSelected = playoffEnabled === option.value;
              return (
                <Button
                  key={String(option.value)}
                  size="$3"
                  theme={isSelected ? 'active' : 'alt2'}
                  backgroundColor={
                    isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.35) : '$gray3'
                  }
                  borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
                  borderWidth={1}
                  borderRadius="$3"
                  onPress={() => handlePlayoffEnabledChange(option.value)}
                  disabled={saving}
                  opacity={saving ? 0.5 : 1}
                  icon={isSelected ? <Check size={14} /> : undefined}
                  aria-pressed={isSelected}
                  aria-label={`Playoffs: ${option.label}`}
                  hoverStyle={
                    saving
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

        {playoffEnabled && (
          <>
            <Separator />

            {/* Playoff Format */}
            <YStack gap="$2">
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Playoff Format
                </Text>
                <Text fontSize="$2" color="$gray10">
                  Number of teams that qualify for the playoffs. 6-team includes
                  a wildcard round; 8-team has two wildcard rounds.
                </Text>
              </YStack>
              <XStack gap="$2" flexWrap="wrap">
                {PLAYOFF_FORMAT_OPTIONS.map((option) => {
                  const isSelected = playoffFormat === option.value;
                  return (
                    <Button
                      key={option.value}
                      size="$3"
                      theme={isSelected ? 'active' : 'alt2'}
                      backgroundColor={
                        isSelected
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
                          : '$gray3'
                      }
                      borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
                      borderWidth={1}
                      borderRadius="$3"
                      onPress={() => handlePlayoffFormatChange(option.value)}
                      disabled={saving}
                      opacity={saving ? 0.5 : 1}
                      icon={isSelected ? <Check size={14} /> : undefined}
                      aria-pressed={isSelected}
                      aria-label={`Playoff format: ${option.label}`}
                      hoverStyle={
                        saving
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

            <Separator />

            {/* Playoff Multi-Week Matchups */}
            <YStack gap="$2">
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Multi-Week Playoff Matchups
                </Text>
                <Text fontSize="$2" color="$gray10">
                  When enabled, each playoff round spans two weeks instead of
                  one. This increases the sample size for each matchup.
                </Text>
              </YStack>
              <XStack gap="$2" flexWrap="wrap">
                {(
                  [
                    { label: 'Single week', value: false },
                    { label: 'Two weeks', value: true },
                  ] as const
                ).map((option) => {
                  const isSelected = playoffMultiWeek === option.value;
                  return (
                    <Button
                      key={String(option.value)}
                      size="$3"
                      theme={isSelected ? 'active' : 'alt2'}
                      backgroundColor={
                        isSelected
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.35)
                          : '$gray3'
                      }
                      borderColor={isSelected ? BRAND_NAVY_LIGHT : '$gray6'}
                      borderWidth={1}
                      borderRadius="$3"
                      onPress={() => handlePlayoffMultiWeekChange(option.value)}
                      disabled={saving}
                      opacity={saving ? 0.5 : 1}
                      icon={isSelected ? <Check size={14} /> : undefined}
                      aria-pressed={isSelected}
                      aria-label={`Multi-week playoffs: ${option.label}`}
                      hoverStyle={
                        saving
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
          </>
        )}

        {/* Salary Cap Settings (LS-646) */}
        <Separator />
        <YStack gap="$3">
          <Text fontWeight="600" fontSize="$4">
            Salary Cap
          </Text>
          <Text fontSize="$2" color="$gray10">
            Control player salary limits and roster spending caps.
          </Text>
          <XStack
            alignItems="center"
            gap="$3"
            padding="$3"
            borderRadius="$4"
            borderWidth={1}
            borderColor={
              salaryCapEnabled
                ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                : '$borderColor'
            }
            backgroundColor={
              salaryCapEnabled ? withAlpha(BRAND_NAVY_LIGHT, 0.08) : '$color1'
            }
            cursor="pointer"
            onPress={() => {
              setSalaryCapEnabled(!salaryCapEnabled);
              setHasChanges(true);
            }}
          >
            <YStack
              width={24}
              height={24}
              borderRadius={12}
              borderWidth={2}
              borderColor={salaryCapEnabled ? BRAND_NAVY_LIGHT : '$borderColor'}
              backgroundColor={
                salaryCapEnabled ? BRAND_NAVY_LIGHT : 'transparent'
              }
              alignItems="center"
              justifyContent="center"
            >
              {salaryCapEnabled && <Check size={14} color="white" />}
            </YStack>
            <YStack flex={1}>
              <Text fontWeight="600">Enable Salary Cap</Text>
              <Text fontSize="$2" color="$gray10">
                Track player salaries and enforce roster spending limits
              </Text>
            </YStack>
          </XStack>
          {salaryCapEnabled && (
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="600">
                Salary Cap Limit
              </Text>
              <Input
                value={salaryCap != null ? String(salaryCap) : ''}
                onChangeText={(text: string) => {
                  const n = parseInt(text, 10);
                  setSalaryCap(isNaN(n) ? null : n);
                  setHasChanges(true);
                }}
                placeholder="e.g. 50000000"
                keyboardType="numeric"
              />
              <Text fontSize="$2" color="$gray10">
                Maximum total salary each team can spend
              </Text>
            </YStack>
          )}
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
