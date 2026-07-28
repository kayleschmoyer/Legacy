import React, { useState } from 'react';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { DateTimePicker, Skeleton } from '@legacy-sports/shared-components';
import {
  CUSTOM_ERA_MIN_YEAR_BY_SPORT,
  CustomEraRange,
  DraftSlotTradingField,
  EraFilterGrid,
  FaabBudgetField,
  MAX_SALARY_CAP,
  MIN_SALARY_CAP,
  SalaryCapField,
  WaiverSystemField,
  type WaiverType,
} from '@legacy-sports/shared-components/leagues';
import { LOGGER } from '@legacy-sports/logging';
import {
  CreateLeagueMutation,
  DefensiveFormat as DefensiveFormatEnum,
  Sport,
  useCreateLeagueMutation,
} from '@legacy-sports/graphql';
import { PremiumGate, useSubscription } from '../../../features/subscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

// ── Types ────────────────────────────────────────────────────────────────────

type SportChoice = 'baseball' | 'football';
type ScoringFormat = 'standard' | 'half_ppr' | 'ppr';
type DefensiveFormat = 'dst' | 'idp';

interface BaseballFormData {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nl' | 'al';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  baseballEraFilter: string;
  customEraStartYear?: number;
  customEraEndYear?: number;
  waiverType: WaiverType;
  faabBudgetDefault: number;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  // Premium (LS-8675): managers may trade draft slots pre-draft. Hidden and
  // coerced false for auction leagues — no slots to trade.
  allowDraftSlotTrading: boolean;
}

interface FootballFormData {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nfl' | 'afc' | 'nfc';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  scoringFormat: ScoringFormat;
  defensiveFormat: DefensiveFormat;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DRAFT_MODE_OPTIONS = [
  { label: 'Live', value: 'live' },
  { label: 'Auto', value: 'automated' },
] as const;

const SELECTION_METHOD_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
] as const;

const DRAFT_ORDER_OPTIONS = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
] as const;

const BASEBALL_TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16];
const BASEBALL_ROSTER_SIZE_OPTIONS = [20, 22, 25, 30, 35, 40];
const BASEBALL_PLAYER_POOL_OPTIONS = [
  { label: 'All MLB', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
] as const;

const FOOTBALL_TEAM_COUNT_OPTIONS = [8, 10, 12, 14] as const;
const FOOTBALL_ROSTER_SIZE_OPTIONS = [13, 14, 15, 16, 17, 18] as const;
const FOOTBALL_PLAYER_POOL_OPTIONS: ReadonlyArray<{
  label: string;
  value: 'all' | 'nfl' | 'afc' | 'nfc';
}> = [
  { label: 'All NFL', value: 'all' },
  { label: 'AFC', value: 'afc' },
  { label: 'NFC', value: 'nfc' },
];

const SCORING_FORMAT_OPTIONS: ReadonlyArray<{
  id: ScoringFormat;
  label: string;
  description: string;
}> = [
  { id: 'standard', label: 'Standard', description: 'No reception bonus' },
  { id: 'half_ppr', label: 'Half-PPR', description: '0.5 pts per reception' },
  { id: 'ppr', label: 'PPR', description: '1 pt per reception' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Range check for the salary cap amount (LS-8361) — mirrors the LS-6115 web
// fix in apps/web/src/pages/baseball/LeagueCreatePage.tsx validateFormFull.
function getSalaryCapRangeError(cap: number | undefined): string | undefined {
  return cap !== undefined && (cap < MIN_SALARY_CAP || cap > MAX_SALARY_CAP)
    ? `Salary cap must be between ${MIN_SALARY_CAP} and ${MAX_SALARY_CAP}`
    : undefined;
}

function SelectRow<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
  loading,
  color = '$green8',
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange: (v: T) => void;
  loading: boolean;
  color?: string;
}): React.JSX.Element {
  return (
    <YStack space="$2">
      <Text size="$4" fontWeight="600" color="$gray12">
        {label}
      </Text>
      <XStack space="$2" flexWrap="wrap">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Button
              key={String(opt.value)}
              size="$3"
              flex={1}
              minWidth="$8"
              onPress={() => onChange(opt.value)}
              disabled={loading}
              backgroundColor={selected ? color : '$color2'}
              borderColor={selected ? color : '$borderColor'}
              borderWidth={selected ? 2 : 1}
              elevation={selected ? 3 : 1}
              pressStyle={{ scale: 0.95 }}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <Text
                color={selected ? '$color12' : '$color'}
                fontWeight={selected ? '700' : '500'}
              >
                {opt.label}
              </Text>
            </Button>
          );
        })}
      </XStack>
      {hint != null && (
        <Text size="$2" color="$gray10">
          {hint}
        </Text>
      )}
    </YStack>
  );
}

// ── Sport selector ────────────────────────────────────────────────────────────

function SportSelector({
  value,
  onChange,
  disabled,
}: {
  value: SportChoice;
  onChange: (s: SportChoice) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <YStack space="$2">
      <Text size="$4" fontWeight="600" color="$gray12">
        Sport *
      </Text>
      <XStack space="$3">
        {(
          [
            { sport: 'baseball' as const, label: '⚾ Baseball' },
            { sport: 'football' as const, label: '🏈 Football' },
          ] as const
        ).map(({ sport, label }) => {
          const selected = value === sport;
          return (
            <Button
              key={sport}
              flex={1}
              size="$4"
              onPress={() => onChange(sport)}
              disabled={disabled}
              backgroundColor={selected ? '$brandNavyLight' : '$color2'}
              borderColor={selected ? '$brandNavyLight' : '$borderColor'}
              borderWidth={selected ? 2 : 1}
              elevation={selected ? 3 : 1}
              pressStyle={{ scale: 0.95 }}
              testID={`sport-selector-${sport}`}
              accessibilityRole="button"
              accessibilityLabel={`Select ${label}`}
            >
              <Text
                color={selected ? '$brandGold' : '$color'}
                fontWeight={selected ? '700' : '500'}
                fontSize="$4"
              >
                {label}
              </Text>
            </Button>
          );
        })}
      </XStack>
    </YStack>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateLeagueScreen(): React.JSX.Element {
  const router = useRouter();
  const { name: prefillName } = useLocalSearchParams<{ name?: string }>();
  const [sport, setSport] = useState<SportChoice>('baseball');

  const initialLeagueName = (prefillName ?? '').trim().slice(0, 50);

  // ── Baseball form state ──────────────────────────────────────────────────
  const [baseballForm, setBaseballForm] = useState<BaseballFormData>({
    leagueName: initialLeagueName,
    numberOfTeams: 12,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 25,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    baseballEraFilter: 'all',
    waiverType: 'standard',
    faabBudgetDefault: 100,
    salaryCapEnabled: false,
    allowDraftSlotTrading: false,
  });

  // ── Football form state ──────────────────────────────────────────────────
  const [footballForm, setFootballForm] = useState<FootballFormData>({
    leagueName: initialLeagueName,
    numberOfTeams: 12,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 16,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  });

  const { isPremium, loading: premiumLoading } = useSubscription();

  const goToUpgrade = (featureName: string) => {
    trackPremiumFeatureClick(featureName);
    void router.navigate('subscription-settings');
  };

  const [createLeagueAndTeams, { loading, error }] = useCreateLeagueMutation({
    onCompleted: (data: CreateLeagueMutation) => {
      if (data.createLeagueAndTeams?.league?.id) {
        const leagueId = data.createLeagueAndTeams.league.id;
        router.push(
          sport === 'football'
            ? `/football/league/${leagueId}`
            : `/baseball/league/${leagueId}`,
        );
      }
    },
    onError: (err: unknown) => {
      LOGGER.error(
        'Error creating league:',
        err instanceof Error ? err : new Error(String(err)),
      );
      const message =
        err instanceof Error ? err.message : 'Failed to create league';
      Alert.alert('Error', message);
    },
  });

  // ── Baseball helpers ──────────────────────────────────────────────────────
  const setBaseballField = <K extends keyof BaseballFormData>(
    field: K,
    value: BaseballFormData[K],
  ) => {
    setBaseballForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateBaseball = (): string | null => {
    const name = baseballForm.leagueName.trim();
    if (!name) return 'Please enter a league name';
    if (name.length < 3)
      return 'League name must be at least 3 characters long';
    if (name.length > 50) return 'League name must be less than 50 characters';
    if (baseballForm.numberOfTeams < 4 || baseballForm.numberOfTeams > 16)
      return 'Number of teams must be between 4 and 16';
    if (baseballForm.maxRosterSize < 15 || baseballForm.maxRosterSize > 50)
      return 'Roster size must be between 15 and 50 players';
    if (!baseballForm.draftDate) return 'Please select a draft date';
    if (baseballForm.draftDate < new Date())
      return 'Draft date must be in the future';
    if (baseballForm.baseballEraFilter === 'custom') {
      if (
        baseballForm.customEraStartYear === undefined ||
        baseballForm.customEraEndYear === undefined
      )
        return 'Please enter both a start and end year for the custom era';
      if (baseballForm.customEraStartYear > baseballForm.customEraEndYear)
        return 'Custom era start year must be before the end year';
      const minYear = CUSTOM_ERA_MIN_YEAR_BY_SPORT.baseball;
      const currentYear = new Date().getFullYear();
      if (
        baseballForm.customEraStartYear < minYear ||
        baseballForm.customEraStartYear > currentYear
      )
        return `Custom era start year must be between ${minYear} and ${currentYear}`;
      if (
        baseballForm.customEraEndYear < minYear ||
        baseballForm.customEraEndYear > currentYear
      )
        return `Custom era end year must be between ${minYear} and ${currentYear}`;
    }
    if (baseballForm.salaryCapEnabled) {
      if (baseballForm.salaryCap === undefined)
        return 'Please enter a salary cap amount';
      const rangeError = getSalaryCapRangeError(baseballForm.salaryCap);
      if (rangeError) return rangeError;
    }
    return null;
  };

  const salaryCapError = baseballForm.salaryCapEnabled
    ? getSalaryCapRangeError(baseballForm.salaryCap)
    : undefined;

  // ── Football helpers ──────────────────────────────────────────────────────
  const setFootballField = <K extends keyof FootballFormData>(
    field: K,
    value: FootballFormData[K],
  ) => {
    setFootballForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateFootball = (): string | null => {
    const name = footballForm.leagueName.trim();
    if (!name || name.length < 3)
      return 'League name must be at least 3 characters.';
    if (name.length > 50) return 'League name must be less than 50 characters.';
    if (footballForm.numberOfTeams < 4 || footballForm.numberOfTeams > 16)
      return 'Number of teams must be between 4 and 16.';
    if (!footballForm.draftDate) return 'Please select a draft date.';
    if (footballForm.draftDate < new Date())
      return 'Draft date must be in the future.';
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (sport === 'baseball') {
      const validationError = validateBaseball();
      if (validationError) {
        Alert.alert('Error', validationError);
        return;
      }
      try {
        await createLeagueAndTeams({
          variables: {
            input: {
              leagueName: baseballForm.leagueName.trim(),
              numberOfTeams: baseballForm.numberOfTeams,
              playerPool: baseballForm.playerPool,
              draftMode: baseballForm.draftMode,
              selectionMethod: baseballForm.selectionMethod,
              draftOrder: baseballForm.draftOrder,
              maxRosterSize: baseballForm.maxRosterSize,
              startDate: (baseballForm.draftDate ?? new Date()).toISOString(),
              eraFilter: baseballForm.baseballEraFilter,
              ...(baseballForm.baseballEraFilter === 'custom'
                ? {
                    customEraStartYear: baseballForm.customEraStartYear,
                    customEraEndYear: baseballForm.customEraEndYear,
                  }
                : {}),
              waiverType: baseballForm.waiverType,
              ...(baseballForm.waiverType === 'faab'
                ? { faabBudgetDefault: baseballForm.faabBudgetDefault }
                : {}),
              salaryCapEnabled: baseballForm.salaryCapEnabled,
              ...(baseballForm.salaryCapEnabled
                ? { salaryCap: baseballForm.salaryCap }
                : {}),
              // Draft slot trading (LS-8675) — only sent when enabled for a
              // non-auction draft; the server rejects true for auction leagues.
              ...(baseballForm.selectionMethod !== 'auction' &&
              baseballForm.allowDraftSlotTrading
                ? { allowDraftSlotTrading: true }
                : {}),
            },
          },
        });
      } catch (err) {
        LOGGER.error(
          'Error in handleSubmit:',
          err instanceof Error ? err : new Error(String(err)),
        );
        Alert.alert('Error', 'Failed to create league. Please try again.');
      }
    } else {
      const validationError = validateFootball();
      if (validationError) {
        Alert.alert('Error', validationError);
        return;
      }
      try {
        await createLeagueAndTeams({
          variables: {
            input: {
              leagueName: footballForm.leagueName.trim(),
              sport: Sport.Football,
              numberOfTeams: footballForm.numberOfTeams,
              playerPool: footballForm.playerPool,
              draftMode: footballForm.draftMode,
              selectionMethod: footballForm.selectionMethod,
              draftOrder: footballForm.draftOrder,
              maxRosterSize: footballForm.maxRosterSize,
              startDate: (footballForm.draftDate ?? new Date()).toISOString(),
              defensiveFormat:
                footballForm.defensiveFormat === 'idp'
                  ? DefensiveFormatEnum.Idp
                  : DefensiveFormatEnum.Dst,
              scoringFormat: footballForm.scoringFormat,
            },
          },
        });
      } catch (err) {
        LOGGER.error(
          'Error in handleSubmit:',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  };

  const isNameValid =
    sport === 'baseball'
      ? baseballForm.leagueName.trim().length >= 3
      : footballForm.leagueName.trim().length >= 3;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      <YStack space="$6" maxWidth={600} alignSelf="center" width="100%">
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$8" color="$color" textAlign="center">
            Create League
          </H1>
          <Text size="$4" color="$gray11" textAlign="center">
            Set up your fantasy league
          </Text>
        </YStack>

        {/* Form Card */}
        <Card
          elevate
          size="$4"
          bordered
          backgroundColor="$color2"
          borderColor="$borderColor"
          padding="$4"
        >
          <YStack space="$5">
            <H2 size="$6" color="$color" marginBottom="$2">
              League Settings
            </H2>

            {/* Sport Selector */}
            <SportSelector
              value={sport}
              onChange={setSport}
              disabled={loading}
            />

            {/* League Name */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                League Name *
              </Text>
              <Input
                size="$4"
                placeholder="Enter your league name"
                value={
                  sport === 'baseball'
                    ? baseballForm.leagueName
                    : footballForm.leagueName
                }
                onChangeText={(text: string) =>
                  sport === 'baseball'
                    ? setBaseballField('leagueName', text)
                    : setFootballField('leagueName', text)
                }
                borderColor="$borderColor"
                backgroundColor="$color1"
                disabled={loading}
              />
            </YStack>

            {/* Baseball-specific fields */}
            {sport === 'baseball' && (
              <>
                {/* Team Count */}
                <YStack space="$2">
                  <Text size="$4" fontWeight="600" color="$gray12">
                    Number of Teams *
                  </Text>
                  <XStack space="$2" flexWrap="wrap">
                    {BASEBALL_TEAM_COUNT_OPTIONS.map((count) => {
                      const selected = baseballForm.numberOfTeams === count;
                      return (
                        <Button
                          key={count}
                          size="$3"
                          onPress={() =>
                            setBaseballField('numberOfTeams', count)
                          }
                          disabled={loading}
                          minWidth="$5"
                          backgroundColor={
                            selected ? '$brandNavyLight' : '$color2'
                          }
                          borderColor={
                            selected ? '$brandNavyLight' : '$borderColor'
                          }
                          borderWidth={selected ? 2 : 1}
                          elevation={selected ? 3 : 1}
                          pressStyle={{ scale: 0.95 }}
                        >
                          <Text
                            color={selected ? '$brandGold' : '$color'}
                            fontWeight={selected ? '700' : '500'}
                          >
                            {count}
                          </Text>
                        </Button>
                      );
                    })}
                  </XStack>
                  <Text size="$2" color="$gray10">
                    Select between 4-16 teams for your league
                  </Text>
                </YStack>

                {/* Roster Size */}
                <YStack space="$2">
                  <Text size="$4" fontWeight="600" color="$gray12">
                    Roster Size *
                  </Text>
                  <XStack space="$2" flexWrap="wrap">
                    {BASEBALL_ROSTER_SIZE_OPTIONS.map((size) => {
                      const selected = baseballForm.maxRosterSize === size;
                      return (
                        <Button
                          key={size}
                          size="$3"
                          onPress={() =>
                            setBaseballField('maxRosterSize', size)
                          }
                          disabled={loading}
                          minWidth="$5"
                          backgroundColor={
                            selected ? '$brandNavyLight' : '$color2'
                          }
                          borderColor={
                            selected ? '$brandNavyLight' : '$borderColor'
                          }
                          borderWidth={selected ? 2 : 1}
                          elevation={selected ? 3 : 1}
                          pressStyle={{ scale: 0.95 }}
                        >
                          <Text
                            color={selected ? '$brandGold' : '$color'}
                            fontWeight={selected ? '700' : '500'}
                          >
                            {size}
                          </Text>
                        </Button>
                      );
                    })}
                  </XStack>
                  <Text size="$2" color="$gray10">
                    Number of players each team can have (15-50 recommended)
                  </Text>
                </YStack>

                {/* Player Pool */}
                <SelectRow
                  label="Player Pool *"
                  hint="Which players can be drafted in this league"
                  options={BASEBALL_PLAYER_POOL_OPTIONS}
                  value={baseballForm.playerPool}
                  onChange={(v) => setBaseballField('playerPool', v)}
                  loading={loading}
                  color="$green8"
                />
              </>
            )}

            {/* Football-specific fields */}
            {sport === 'football' && (
              <>
                {/* Team Count */}
                <SelectRow
                  label="Number of Teams *"
                  hint="10 or 12 is standard for football."
                  options={FOOTBALL_TEAM_COUNT_OPTIONS.map((n) => ({
                    label: String(n),
                    value: n,
                  }))}
                  value={footballForm.numberOfTeams}
                  onChange={(v) => setFootballField('numberOfTeams', v)}
                  loading={loading}
                  color="$green8"
                />

                {/* Roster Size */}
                <SelectRow
                  label="Roster Size *"
                  hint="16 is the standard (1 QB, 2 RB, 2 WR, 1 TE, K, DEF + bench)."
                  options={FOOTBALL_ROSTER_SIZE_OPTIONS.map((n) => ({
                    label: String(n),
                    value: n,
                  }))}
                  value={footballForm.maxRosterSize}
                  onChange={(v) => setFootballField('maxRosterSize', v)}
                  loading={loading}
                  color="$green8"
                />

                {/* Player Pool */}
                <SelectRow
                  label="Player Pool *"
                  options={FOOTBALL_PLAYER_POOL_OPTIONS}
                  value={footballForm.playerPool}
                  onChange={(v) => setFootballField('playerPool', v)}
                  loading={loading}
                  color="$green8"
                />

                {/* Scoring Format */}
                <YStack space="$3">
                  <YStack space="$1">
                    <Text size="$4" fontWeight="700" color="$gray12">
                      Scoring Format
                    </Text>
                    <Text size="$2" color="$gray10">
                      Sets the reception bonus. All other stats are identical.
                    </Text>
                  </YStack>
                  <XStack space="$2">
                    {SCORING_FORMAT_OPTIONS.map((opt) => {
                      const selected = footballForm.scoringFormat === opt.id;
                      return (
                        <Button
                          key={opt.id}
                          size="$3"
                          flex={1}
                          onPress={() =>
                            setFootballField('scoringFormat', opt.id)
                          }
                          disabled={loading}
                          backgroundColor={selected ? '$teal8' : '$color2'}
                          borderColor={selected ? '$teal8' : '$borderColor'}
                          borderWidth={selected ? 2 : 1}
                          elevation={selected ? 3 : 1}
                          pressStyle={{ scale: 0.95 }}
                        >
                          <YStack alignItems="center" space="$1">
                            <Text
                              color={selected ? '$teal12' : '$color'}
                              fontWeight={selected ? '700' : '500'}
                              fontSize="$4"
                            >
                              {opt.label}
                            </Text>
                            <Text
                              color={selected ? '$teal10' : '$gray9'}
                              fontSize="$1"
                            >
                              {opt.description}
                            </Text>
                          </YStack>
                        </Button>
                      );
                    })}
                  </XStack>
                </YStack>

                {/* Defensive Format */}
                <YStack space="$3">
                  <YStack space="$1">
                    <Text size="$4" fontWeight="700" color="$gray12">
                      Defensive Format
                    </Text>
                    <Text size="$2" color="$gray10">
                      D/ST uses one team defense slot. IDP uses individual
                      defensive players (DL/LB/DB).
                    </Text>
                  </YStack>
                  <XStack space="$2">
                    {(
                      [
                        {
                          id: 'dst' as const,
                          label: 'D/ST',
                          sub: 'Team Defense',
                        },
                        {
                          id: 'idp' as const,
                          label: 'IDP',
                          sub: 'Individual Players',
                        },
                      ] as const
                    ).map((opt) => {
                      const selected = footballForm.defensiveFormat === opt.id;
                      return (
                        <Button
                          key={opt.id}
                          size="$3"
                          flex={1}
                          onPress={() =>
                            setFootballField('defensiveFormat', opt.id)
                          }
                          disabled={loading}
                          backgroundColor={selected ? '$orange8' : '$color2'}
                          borderColor={selected ? '$orange8' : '$borderColor'}
                          borderWidth={selected ? 2 : 1}
                          elevation={selected ? 3 : 1}
                          pressStyle={{ scale: 0.95 }}
                        >
                          <YStack alignItems="center" space="$1">
                            <Text
                              color={selected ? '$orange12' : '$color'}
                              fontWeight={selected ? '700' : '500'}
                              fontSize="$4"
                            >
                              {opt.label}
                            </Text>
                            <Text
                              color={selected ? '$orange10' : '$gray9'}
                              fontSize="$1"
                            >
                              {opt.sub}
                            </Text>
                          </YStack>
                        </Button>
                      );
                    })}
                  </XStack>
                </YStack>
              </>
            )}

            {/* Shared: Draft Mode */}
            <SelectRow
              label="Draft Mode"
              hint="Live requires all managers online; automated runs on a schedule"
              options={DRAFT_MODE_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={
                sport === 'baseball'
                  ? baseballForm.draftMode
                  : footballForm.draftMode
              }
              onChange={(v) =>
                sport === 'baseball'
                  ? setBaseballField('draftMode', v)
                  : setFootballField('draftMode', v)
              }
              loading={loading}
              color="$green8"
            />

            {/* Shared: Selection Method */}
            <SelectRow
              label="Selection Method"
              hint="Standard picks, auction bidding, or random assignment"
              options={SELECTION_METHOD_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={
                sport === 'baseball'
                  ? baseballForm.selectionMethod
                  : footballForm.selectionMethod
              }
              onChange={(v) =>
                sport === 'baseball'
                  ? setBaseballForm((prev) => ({
                      ...prev,
                      selectionMethod: v,
                      // Auction drafts have no slots to trade (LS-8675) —
                      // coerce the hidden toggle back off so a previously
                      // enabled value can't be submitted.
                      ...(v === 'auction'
                        ? { allowDraftSlotTrading: false }
                        : {}),
                    }))
                  : setFootballField('selectionMethod', v)
              }
              loading={loading}
              color="$green8"
            />

            {/* Shared: Draft Order */}
            <SelectRow
              label="Draft Order"
              hint="Snake order reverses each round; linear stays the same"
              options={DRAFT_ORDER_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={
                sport === 'baseball'
                  ? baseballForm.draftOrder
                  : footballForm.draftOrder
              }
              onChange={(v) =>
                sport === 'baseball'
                  ? setBaseballField('draftOrder', v)
                  : setFootballField('draftOrder', v)
              }
              loading={loading}
              color="$green8"
            />

            {/* Shared: Draft Date */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Draft Date & Time
              </Text>
              <DateTimePicker
                value={
                  sport === 'baseball'
                    ? baseballForm.draftDate
                    : footballForm.draftDate
                }
                onChange={(date: Date) =>
                  sport === 'baseball'
                    ? setBaseballField('draftDate', date)
                    : setFootballField('draftDate', date)
                }
                placeholder="Select draft date and time"
                disabled={loading}
                minDate={new Date()}
              />
              <Text size="$2" color="$gray10">
                When do you want to hold your draft?
              </Text>
            </YStack>

            {/* Baseball premium settings */}
            {sport === 'baseball' && (
              <YStack space="$4">
                <H2 size="$6" color="$color" marginBottom="$2">
                  🏆 Premium Settings
                </H2>

                {premiumLoading ? (
                  // While the entitlement fetch is in flight, show a neutral
                  // loading placeholder instead of the non-premium upsell card
                  // and "locked" controls — otherwise a premium user briefly
                  // sees themselves treated as free on cold load (LS-8380,
                  // same defect class as the web fix in LS-6088).
                  <YStack
                    space="$3"
                    testID="premium-settings-loading"
                    accessibilityLabel="Loading premium settings"
                  >
                    <Skeleton height={72} radius={8} />
                    <Skeleton height={56} radius={8} />
                    <Skeleton height={56} radius={8} />
                  </YStack>
                ) : (
                  <>
                    {!isPremium && (
                      <Card
                        backgroundColor="$color2"
                        borderColor="$borderColor"
                        padding="$3"
                        bordered
                      >
                        <Text size="$3" color="$gray11">
                          Salary cap, FAAB waivers, draft slot trading, and
                          historical era filters are Premium features. Free
                          leagues use All Eras and standard waivers.
                        </Text>
                      </Card>
                    )}

                    <YStack space="$2">
                      <Text size="$4" fontWeight="600" color="$gray12">
                        Historical Era Filter
                      </Text>
                      <EraFilterGrid
                        sport="baseball"
                        value={baseballForm.baseballEraFilter}
                        onChange={(v) =>
                          setBaseballField('baseballEraFilter', v)
                        }
                        isPremium={isPremium}
                        disabled={loading}
                        onUpgrade={() =>
                          goToUpgrade('Historical Era Selection')
                        }
                      />
                      {baseballForm.baseballEraFilter === 'custom' && (
                        <CustomEraRange
                          startYear={baseballForm.customEraStartYear}
                          endYear={baseballForm.customEraEndYear}
                          onChangeStart={(v) =>
                            setBaseballField('customEraStartYear', v)
                          }
                          onChangeEnd={(v) =>
                            setBaseballField('customEraEndYear', v)
                          }
                          disabled={loading}
                        />
                      )}
                      <Text size="$2" color="$gray10">
                        Only players active during this window are draftable.
                      </Text>
                    </YStack>

                    <WaiverSystemField
                      value={baseballForm.waiverType}
                      onChange={(v) => setBaseballField('waiverType', v)}
                      isPremium={isPremium}
                      disabled={loading}
                      onUpgrade={() => goToUpgrade('FAAB Waiver Settings')}
                    />

                    {baseballForm.waiverType === 'faab' && (
                      <PremiumGate
                        isPremium={isPremium}
                        featureName="FAAB Waiver Settings"
                        featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding."
                      >
                        <FaabBudgetField
                          value={baseballForm.faabBudgetDefault}
                          onChange={(v) =>
                            setBaseballField('faabBudgetDefault', v)
                          }
                          disabled={loading}
                        />
                      </PremiumGate>
                    )}

                    <PremiumGate
                      isPremium={isPremium}
                      featureName="Salary Cap"
                      featureDescription="Track player salaries and enforce roster spending caps."
                    >
                      <SalaryCapField
                        enabled={baseballForm.salaryCapEnabled}
                        amount={baseballForm.salaryCap}
                        onToggleEnabled={(v) =>
                          setBaseballField('salaryCapEnabled', v)
                        }
                        onAmountChange={(v) => setBaseballField('salaryCap', v)}
                        isPremium={isPremium}
                        disabled={loading}
                        error={salaryCapError}
                        onUpgrade={() => goToUpgrade('Salary Cap')}
                        numberOfTeams={baseballForm.numberOfTeams}
                        maxRosterSize={baseballForm.maxRosterSize}
                      />
                    </PremiumGate>

                    {/* Draft Slot Trading — hidden for auction leagues (no
                        slots to trade; server rejects it, LS-8675) */}
                    {baseballForm.selectionMethod !== 'auction' && (
                      <DraftSlotTradingField
                        enabled={baseballForm.allowDraftSlotTrading}
                        onToggleEnabled={(v) =>
                          setBaseballField('allowDraftSlotTrading', v)
                        }
                        isPremium={isPremium}
                        disabled={loading}
                        onUpgrade={() => goToUpgrade('Draft Slot Trading')}
                      />
                    )}
                  </>
                )}
              </YStack>
            )}

            {/* Error Display */}
            {error && (
              <Card backgroundColor="$red3" borderColor="$red7" padding="$3">
                <Text color="$red11" size="$3" fontWeight="600">
                  Error: {error.message || 'Failed to create league'}
                </Text>
                <Text color="$red10" size="$2" marginTop="$1">
                  Please check your inputs and try again.
                </Text>
              </Card>
            )}

            {/* Action Buttons */}
            <XStack space="$3" justifyContent="flex-end" marginTop="$4">
              <Button
                size="$4"
                variant="outlined"
                onPress={() => router.navigate(`/${sport}`)}
                disabled={loading}
                backgroundColor="$color1"
                borderColor="$borderColor"
              >
                <Text color="$color">Cancel</Text>
              </Button>
              <Button
                size="$4"
                onPress={() => void handleSubmit()}
                disabled={loading || !isNameValid}
                opacity={loading ? 0.6 : 1}
                backgroundColor="$brandNavy"
              >
                <Text color="white" fontWeight="600">
                  {loading ? 'Creating...' : 'Create League'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </Card>

        {/* Info card */}
        <Card
          size="$4"
          bordered
          backgroundColor={
            sport === 'football' ? '$orange2' : '$surfaceInteractive'
          }
          borderColor={sport === 'football' ? '$orange6' : '$outlineSubtle'}
          padding="$4"
        >
          <YStack space="$3">
            <H2
              size="$5"
              color={sport === 'football' ? '$orange11' : '$brandGoldLight'}
            >
              What happens next?
            </H2>
            <Text
              size="$3"
              color={sport === 'football' ? '$orange11' : '$brandGoldLight'}
            >
              • Your league will be created with the specified number of teams
            </Text>
            <Text
              size="$3"
              color={sport === 'football' ? '$orange11' : '$brandGoldLight'}
            >
              • You'll be set as the league commissioner
            </Text>
            {sport === 'football' && (
              <Text size="$3" color="$orange11">
                {footballForm.defensiveFormat === 'idp'
                  ? '• IDP roster slots (DL/LB/DB) will be configured for your league'
                  : '• A single D/ST slot is included in the default roster'}
              </Text>
            )}
            <Text
              size="$3"
              color={sport === 'football' ? '$orange11' : '$brandGoldLight'}
            >
              • You can invite friends to join your league after creation
            </Text>
          </YStack>
        </Card>
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
