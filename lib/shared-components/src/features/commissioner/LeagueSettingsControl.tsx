import React, { useCallback, useEffect, useState } from 'react';
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
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import { Settings } from '@tamagui/lucide-icons/icons/Settings';
import { useUpdateLeagueSettingsMutation } from '@legacy-sports/graphql';
import { GAMES_PER_MATCHUP_BY_SPORT } from '../../config/sports';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';
import { PremiumGate } from '../../components/PremiumGate';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import {
  FaabBudgetField,
  WaiverSystemField,
} from '../leagues/premium/WaiverFields';
import type { WaiverType } from '../leagues/premium/constants';

export interface LeagueSettingsControlProps {
  leagueId: number;
  /** Sport for the league — determines per-sport gamesPerMatchup bounds. Defaults to 'baseball'. */
  sport?: string;
  draftStatus?: string | null;
  currentGamesPerMatchup?: number;
  currentSpStartsPerMatchup?: number;
  currentMinCareerGames?: number;
  currentMinCareerSeasons?: number;
  /** Pitcher career minimums on pitching appearances (LS-10807). 0 = off. */
  currentMinCareerPitcherGames?: number;
  currentMinCareerPitcherSeasons?: number;
  currentTotalMatchups?: number;
  currentPlayoffEnabled?: boolean;
  currentPlayoffFormat?: string;
  currentPlayoffMultiWeek?: boolean;
  // Salary cap settings (LS-646)
  currentSalaryCapEnabled?: boolean;
  currentSalaryCap?: number | null;
  // Waiver settings (LS-6305)
  currentWaiverType?: WaiverType;
  currentFaabBudgetDefault?: number;
  /** Whether the current user has premium access. Passed down from the host app. */
  isPremium?: boolean;
  /** Optional upgrade callback forwarded to the PremiumGate. Callers supply platform-specific navigation. */
  onUpgrade?: () => void;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

// Digits only: rejects signs, decimals and blanks in the numeric text
// inputs.
const WHOLE_NUMBER_PATTERN = /^\d+$/;

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

type MinimumOption = { readonly label: string; readonly value: number };

/**
 * One labelled row of career-minimum choices (batters or pitchers). The
 * aria-label prefix keeps each row's buttons distinct for assistive tech and
 * tests, e.g. "Minimum career games: 50" vs "Minimum career games pitched: 50".
 */
function CareerMinimumRow({
  label,
  ariaPrefix,
  options,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  ariaPrefix: string;
  options: readonly MinimumOption[];
  selected: number;
  onSelect: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <YStack gap="$1.5">
      <Text fontSize="$2" fontWeight="600" color="$gray11">
        {label}
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        {options.map((option) => {
          const isSelected = selected === option.value;
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
              onPress={() => onSelect(option.value)}
              disabled={disabled}
              opacity={disabled ? 0.5 : 1}
              icon={isSelected ? <Check size={14} /> : undefined}
              aria-pressed={isSelected}
              aria-label={`${ariaPrefix}: ${option.label}`}
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

function isAdvancedPlayoffFormat(format: string): boolean {
  return format === '6-team' || format === '8-team';
}

/**
 * LeagueSettingsControl — Commissioner control for league-level matchup settings.
 *
 * Manages games per matchup and SP starts per matchup. SP starts cannot exceed
 * games per matchup. Changes propagate to scheduled matchups.
 */
export function LeagueSettingsControl({
  leagueId,
  sport = 'baseball',
  draftStatus,
  currentGamesPerMatchup = 1,
  currentSpStartsPerMatchup = 1,
  currentMinCareerGames = 50,
  currentMinCareerSeasons = 3,
  currentMinCareerPitcherGames = 0,
  currentMinCareerPitcherSeasons = 0,
  currentTotalMatchups = 10,
  currentPlayoffEnabled = true,
  currentPlayoffFormat = '4-team',
  currentPlayoffMultiWeek = false,
  currentSalaryCapEnabled = false,
  currentSalaryCap = null,
  currentWaiverType = 'standard',
  currentFaabBudgetDefault = 100,
  isPremium = false,
  onUpgrade,
  onSuccess,
  onError,
}: LeagueSettingsControlProps) {
  const [gamesPerMatchup, setGamesPerMatchup] = useState(
    currentGamesPerMatchup,
  );
  const [spStarts, setSpStarts] = useState(currentSpStartsPerMatchup);
  // Text buffers for the numeric inputs below, decoupled from the numeric
  // state so the field can be freely cleared/edited (see the analogous
  // salaryCap pattern further down). Synced from the numeric state whenever
  // it changes from any source (typing a valid value, the SP-starts clamp,
  // or Reset).
  const [gamesPerMatchupText, setGamesPerMatchupText] = useState(
    String(currentGamesPerMatchup),
  );
  const [spStartsText, setSpStartsText] = useState(
    String(currentSpStartsPerMatchup),
  );
  const [minCareerGames, setMinCareerGames] = useState(currentMinCareerGames);
  const [minCareerSeasons, setMinCareerSeasons] = useState(
    currentMinCareerSeasons,
  );
  // Pitcher minimums (LS-10807) track their own saved baseline instead of
  // threading two more positional args through checkChanges.
  const [pitcherBaseline, setPitcherBaseline] = useState({
    games: currentMinCareerPitcherGames,
    seasons: currentMinCareerPitcherSeasons,
  });
  const [minCareerPitcherGames, setMinCareerPitcherGames] = useState(
    currentMinCareerPitcherGames,
  );
  const [minCareerPitcherSeasons, setMinCareerPitcherSeasons] = useState(
    currentMinCareerPitcherSeasons,
  );
  const pitcherMinimumsChanged =
    minCareerPitcherGames !== pitcherBaseline.games ||
    minCareerPitcherSeasons !== pitcherBaseline.seasons;
  const [totalMatchups, setTotalMatchups] = useState(currentTotalMatchups);
  const [playoffEnabled, setPlayoffEnabled] = useState(currentPlayoffEnabled);
  const effectiveCurrentPlayoffFormat =
    !isPremium && isAdvancedPlayoffFormat(currentPlayoffFormat)
      ? '4-team'
      : currentPlayoffFormat;
  const [playoffFormat, setPlayoffFormat] = useState(
    effectiveCurrentPlayoffFormat,
  );
  const [playoffMultiWeek, setPlayoffMultiWeek] = useState(
    currentPlayoffMultiWeek,
  );
  const [salaryCapEnabled, setSalaryCapEnabled] = useState(
    currentSalaryCapEnabled,
  );
  const [salaryCap, setSalaryCap] = useState<number | null>(currentSalaryCap);
  // Same downgrade-safe clamp as effectiveCurrentPlayoffFormat above: a
  // grandfathered FAAB league whose commissioner has since lost premium must
  // not silently resubmit 'faab' on save (LS-5912-class ForbiddenError).
  const effectiveCurrentWaiverType: WaiverType =
    !isPremium && currentWaiverType === 'faab' ? 'standard' : currentWaiverType;
  const [waiverType, setWaiverType] = useState<WaiverType>(
    effectiveCurrentWaiverType,
  );
  const [faabBudgetDefault, setFaabBudgetDefault] = useState(
    currentFaabBudgetDefault,
  );
  const [hasChanges, setHasChanges] = useState(false);

  const resolvedSport = sport === 'football' ? 'football' : 'baseball';
  const sportBounds =
    GAMES_PER_MATCHUP_BY_SPORT[resolvedSport] ??
    GAMES_PER_MATCHUP_BY_SPORT.baseball;
  // Pitcher starts and MLB career minimums are baseball-only (LS-10507).
  const isBaseball = resolvedSport === 'baseball';

  useEffect(() => {
    setGamesPerMatchupText(String(gamesPerMatchup));
  }, [gamesPerMatchup]);

  useEffect(() => {
    setSpStartsText(String(spStarts));
  }, [spStarts]);

  const isLocked = draftStatus === 'completed';
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
      scEnabled: boolean = salaryCapEnabled,
      sc: number | null = salaryCap ?? null,
      wType: WaiverType = waiverType,
      faabBudget: number = faabBudgetDefault,
    ) => {
      setHasChanges(
        games !== currentGamesPerMatchup ||
          starts !== currentSpStartsPerMatchup ||
          careerGames !== currentMinCareerGames ||
          careerSeasons !== currentMinCareerSeasons ||
          totMatchups !== currentTotalMatchups ||
          poEnabled !== currentPlayoffEnabled ||
          poFormat !== effectiveCurrentPlayoffFormat ||
          poMultiWeek !== currentPlayoffMultiWeek ||
          scEnabled !== currentSalaryCapEnabled ||
          sc !== currentSalaryCap ||
          wType !== effectiveCurrentWaiverType ||
          (wType === 'faab' && faabBudget !== currentFaabBudgetDefault),
      );
    },
    [
      currentGamesPerMatchup,
      currentSpStartsPerMatchup,
      currentMinCareerGames,
      currentMinCareerSeasons,
      currentTotalMatchups,
      currentPlayoffEnabled,
      effectiveCurrentPlayoffFormat,
      currentPlayoffMultiWeek,
      currentSalaryCapEnabled,
      currentSalaryCap,
      effectiveCurrentWaiverType,
      currentFaabBudgetDefault,
      salaryCapEnabled,
      salaryCap,
      waiverType,
      faabBudgetDefault,
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

  const handleWaiverTypeChange = useCallback(
    (value: WaiverType) => {
      setWaiverType(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
        salaryCapEnabled,
        salaryCap,
        value,
        faabBudgetDefault,
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
      playoffMultiWeek,
      salaryCapEnabled,
      salaryCap,
      faabBudgetDefault,
      checkChanges,
    ],
  );

  const handleFaabBudgetChange = useCallback(
    (value: number) => {
      setFaabBudgetDefault(value);
      checkChanges(
        gamesPerMatchup,
        spStarts,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
        salaryCapEnabled,
        salaryCap,
        waiverType,
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
      playoffMultiWeek,
      salaryCapEnabled,
      salaryCap,
      waiverType,
      checkChanges,
    ],
  );

  const toggleSalaryCap = useCallback(() => {
    const nextEnabled = !salaryCapEnabled;
    setSalaryCapEnabled(nextEnabled);
    checkChanges(
      gamesPerMatchup,
      spStarts,
      minCareerGames,
      minCareerSeasons,
      totalMatchups,
      playoffEnabled,
      playoffFormat,
      playoffMultiWeek,
      nextEnabled,
      salaryCap,
    );
  }, [
    gamesPerMatchup,
    spStarts,
    minCareerGames,
    minCareerSeasons,
    totalMatchups,
    playoffEnabled,
    playoffFormat,
    playoffMultiWeek,
    salaryCapEnabled,
    salaryCap,
    checkChanges,
  ]);

  const validationError =
    gamesPerMatchup < sportBounds.min || gamesPerMatchup > sportBounds.max
      ? `Games per matchup must be between ${sportBounds.min} and ${sportBounds.max}`
      : !isBaseball
        ? null
        : !WHOLE_NUMBER_PATTERN.test(spStartsText)
          ? 'SP starts must be a whole number'
          : spStarts < 1
            ? 'SP starts must be at least 1'
            : spStarts > gamesPerMatchup
              ? `SP starts (${spStarts}) cannot exceed games per matchup (${gamesPerMatchup})`
              : null;

  const isDirty = hasChanges || pitcherMinimumsChanged;

  const handleSave = async () => {
    if (validationError) return;

    try {
      await updateLeagueSettings({
        variables: {
          input: {
            leagueId,
            gamesPerMatchup,
            pitcherStartsPerMatchup: spStarts,
            minCareerGames,
            minCareerSeasons,
            minCareerPitcherGames,
            minCareerPitcherSeasons,
            totalMatchups,
            playoffEnabled,
            playoffFormat,
            playoffMultiWeek,
            salaryCapEnabled,
            salaryCap: salaryCapEnabled ? salaryCap : null,
            waiverType,
            ...(waiverType === 'faab' ? { faabBudgetDefault } : {}),
          },
        },
      });

      setHasChanges(false);
      setPitcherBaseline({
        games: minCareerPitcherGames,
        seasons: minCareerPitcherSeasons,
      });
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
    setMinCareerPitcherGames(pitcherBaseline.games);
    setMinCareerPitcherSeasons(pitcherBaseline.seasons);
    setTotalMatchups(currentTotalMatchups);
    setPlayoffEnabled(currentPlayoffEnabled);
    setPlayoffFormat(effectiveCurrentPlayoffFormat);
    setPlayoffMultiWeek(currentPlayoffMultiWeek);
    setSalaryCapEnabled(currentSalaryCapEnabled);
    setSalaryCap(currentSalaryCap);
    setWaiverType(effectiveCurrentWaiverType);
    setFaabBudgetDefault(currentFaabBudgetDefault);
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
          {isLocked ? (
            <Lock size={20} color="var(--gray10)" />
          ) : (
            <Settings size={20} color={BRAND_NAVY_LIGHT} />
          )}
          <YStack flex={1} flexShrink={1} minWidth={0}>
            <H4 margin={0}>League Settings</H4>
            <Text fontSize="$2" color="$gray10">
              {isLocked
                ? 'Settings are locked — the season is in progress.'
                : 'Configure matchup settings for the league. Changes apply to future scheduled matchups.'}
            </Text>
          </YStack>
        </XStack>

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
              League settings are locked while the season is in progress.
              Settings can only be changed before the draft starts.
            </Text>
          </XStack>
        ) : null}

        <YStack
          gap="$4"
          opacity={isLocked ? 0.5 : 1}
          pointerEvents={isLocked ? 'none' : 'auto'}
        >
          {/* Games Per Matchup */}
          <YStack gap="$2">
            <YStack gap="$1">
              <Text fontSize="$3" fontWeight="600" color="$color">
                Games Per Matchup
              </Text>
              <Text fontSize="$2" color="$gray10">
                Total number of games in each matchup week ({sportBounds.min}–
                {sportBounds.max}).
                {isBaseball
                  ? ' All non-pitcher and RP players play every game.'
                  : ''}{' '}
                Changes apply to scheduled matchups only.
              </Text>
            </YStack>
            <Input
              value={gamesPerMatchupText}
              onChangeText={(text: string) => {
                setGamesPerMatchupText(text);
                const parsed = parseInt(text, 10);
                if (!isNaN(parsed)) {
                  handleGamesChange(parsed);
                }
              }}
              placeholder={`e.g. ${sportBounds.default}`}
              keyboardType="numeric"
              disabled={saving}
              aria-label="Games per matchup"
            />
          </YStack>

          <Separator />

          {isBaseball ? (
            <>
              {/* SP Starts Per Matchup */}
              <YStack gap="$2">
                <YStack gap="$1">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    SP Starts Per Matchup
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    How many games starting pitchers play each matchup (cannot
                    exceed games per matchup). Relief pitchers always play every
                    game.
                  </Text>
                </YStack>
                <Input
                  value={spStartsText}
                  onChangeText={(text: string) => {
                    setSpStartsText(text);
                    // Only commit whole numbers; anything else ("abc", "3.9",
                    // blank) stays in the text buffer and blocks Save via
                    // validationError instead of being truncated (LS-10692).
                    if (WHOLE_NUMBER_PATTERN.test(text)) {
                      handleSpStartsChange(parseInt(text, 10));
                    }
                  }}
                  placeholder="e.g. 1"
                  keyboardType="numeric"
                  disabled={saving}
                  aria-label="SP starts per matchup"
                />
              </YStack>

              <Separator />

              {/* Min Career Games — separate batter / pitcher thresholds (LS-10807) */}
              <YStack gap="$2">
                <YStack gap="$1">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Minimum Career Games
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Players below their threshold are excluded from the draft
                    pool and free agent pool, and cannot hold a starting roster
                    spot. Batters are measured by career MLB games played;
                    pitchers by career MLB games pitched. A two-way player
                    qualifies by meeting either the batter or the pitcher
                    minimums.
                  </Text>
                </YStack>
                <CareerMinimumRow
                  label="Batters — games played"
                  ariaPrefix="Minimum career games"
                  options={MIN_CAREER_GAMES_OPTIONS}
                  selected={minCareerGames}
                  onSelect={handleMinCareerGamesChange}
                  disabled={saving}
                />
                <CareerMinimumRow
                  label="Pitchers — games pitched"
                  ariaPrefix="Minimum career games pitched"
                  options={MIN_CAREER_GAMES_OPTIONS}
                  selected={minCareerPitcherGames}
                  onSelect={setMinCareerPitcherGames}
                  disabled={saving}
                />
              </YStack>

              <Separator />

              {/* Min Career Seasons — separate batter / pitcher thresholds (LS-10807) */}
              <YStack gap="$2">
                <YStack gap="$1">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Minimum Career Seasons
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Batters are measured by distinct MLB seasons (AL/NL) with a
                    batting appearance; pitchers by distinct MLB seasons with a
                    pitching appearance.
                  </Text>
                </YStack>
                <CareerMinimumRow
                  label="Batters — seasons batted"
                  ariaPrefix="Minimum career seasons"
                  options={MIN_CAREER_SEASONS_OPTIONS}
                  selected={minCareerSeasons}
                  onSelect={handleMinCareerSeasonsChange}
                  disabled={saving}
                />
                <CareerMinimumRow
                  label="Pitchers — seasons pitched"
                  ariaPrefix="Minimum career seasons pitched"
                  options={MIN_CAREER_SEASONS_OPTIONS}
                  selected={minCareerPitcherSeasons}
                  onSelect={setMinCareerPitcherSeasons}
                  disabled={saving}
                />
                {minCareerPitcherGames === 0 &&
                minCareerPitcherSeasons === 0 ? (
                  <Text fontSize="$2" color="$gray10">
                    With both pitcher minimums Off, pitchers follow the batter
                    minimums on their batting record, so a pitcher with no MLB
                    batting record is exempt.
                  </Text>
                ) : null}
              </YStack>

              <Separator />
            </>
          ) : null}

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

              {/* Playoff Format — 4-team is free; 6-team and 8-team require premium */}
              <YStack gap="$2">
                <YStack gap="$1">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Playoff Format
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Number of teams that qualify for the playoffs. 6-team
                    includes a wildcard round; 8-team has two wildcard rounds.
                  </Text>
                </YStack>
                <XStack gap="$2" flexWrap="wrap">
                  {PLAYOFF_FORMAT_OPTIONS.filter(
                    (o) => o.value === '4-team',
                  ).map((option) => {
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
                <PremiumGate
                  isPremium={isPremium}
                  featureName="Advanced Playoff Formats"
                  featureDescription="Unlock 6-team and 8-team playoff brackets with wildcard rounds."
                  onUpgrade={onUpgrade}
                >
                  <XStack gap="$2" flexWrap="wrap">
                    {PLAYOFF_FORMAT_OPTIONS.filter(
                      (o) => o.value !== '4-team',
                    ).map((option) => {
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
                          onPress={() =>
                            handlePlayoffFormatChange(option.value)
                          }
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
                </PremiumGate>
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
                        onPress={() =>
                          handlePlayoffMultiWeekChange(option.value)
                        }
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

          {/* Waiver Settings (LS-6305) */}
          <Separator />
          <YStack gap="$3">
            <Text fontWeight="600" fontSize="$4">
              Waiver System
            </Text>
            <WaiverSystemField
              value={waiverType}
              onChange={handleWaiverTypeChange}
              isPremium={isPremium}
              disabled={saving}
              onUpgrade={() => onUpgrade?.()}
            />
            {waiverType === 'faab' && (
              <PremiumGate
                isPremium={isPremium}
                featureName="FAAB Waiver Settings"
                featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding — the most competitive waiver system for serious leagues."
                onUpgrade={onUpgrade}
              >
                <FaabBudgetField
                  value={faabBudgetDefault}
                  onChange={handleFaabBudgetChange}
                  disabled={saving}
                />
              </PremiumGate>
            )}
          </YStack>

          {/* Salary Cap Settings (LS-646) */}
          <Separator />
          <PremiumGate
            isPremium={isPremium}
            featureName="Salary Cap"
            featureDescription="Track player salaries and enforce roster spending caps to create a competitive salary cap league."
            onUpgrade={onUpgrade}
          >
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
                  salaryCapEnabled
                    ? withAlpha(BRAND_NAVY_LIGHT, 0.08)
                    : '$color1'
                }
                cursor="pointer"
                role="switch"
                accessibilityRole="switch"
                aria-checked={salaryCapEnabled}
                accessibilityState={{ checked: salaryCapEnabled }}
                aria-label="Enable Salary Cap"
                tabIndex={0}
                onKeyDown={handleKeyActivate(toggleSalaryCap)}
                focusVisibleStyle={{
                  outlineWidth: 2,
                  outlineColor: '$focusRing',
                  outlineStyle: 'solid',
                  outlineOffset: 1,
                }}
                onPress={toggleSalaryCap}
              >
                <YStack
                  width={24}
                  height={24}
                  borderRadius={12}
                  borderWidth={2}
                  borderColor={
                    salaryCapEnabled ? BRAND_NAVY_LIGHT : '$borderColor'
                  }
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
                      const nextSalaryCap = isNaN(n) ? null : n;
                      setSalaryCap(nextSalaryCap);
                      checkChanges(
                        gamesPerMatchup,
                        spStarts,
                        minCareerGames,
                        minCareerSeasons,
                        totalMatchups,
                        playoffEnabled,
                        playoffFormat,
                        playoffMultiWeek,
                        salaryCapEnabled,
                        nextSalaryCap,
                      );
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
          </PremiumGate>

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
        </YStack>

        {/* Action buttons */}
        <XStack gap="$3" justifyContent="flex-end" flexWrap="wrap">
          <Button
            theme="alt2"
            size="$3"
            onPress={handleReset}
            disabled={isLocked || !isDirty || saving}
            opacity={isLocked || !isDirty ? 0.5 : 1}
          >
            Reset
          </Button>
          <Button
            backgroundColor="$brandNavyLight"
            hoverStyle={{ backgroundColor: '$brandNavy' }}
            pressStyle={{ backgroundColor: '$brandNavyDark' }}
            size="$3"
            onPress={() => void handleSave()}
            disabled={isLocked || !isDirty || saving || !!validationError}
            opacity={isLocked || !isDirty || !!validationError ? 0.5 : 1}
            icon={saving ? <Spinner size="small" /> : undefined}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
