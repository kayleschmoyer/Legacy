import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, H1, H2, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Button, DateTimePicker } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  DEFAULT_NUM_DIVISIONS,
  DEFAULT_NUM_TEAMS,
} from '../../constants/league';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { trackPremiumFeatureClick } from '../../utils/analytics';

// Now using codegen-generated hooks and types

// Import types and configurations
interface CreateLeagueFormData {
  leagueName: string;
  numberOfTeams: number;
  numberOfDivisions: number;
  schedulingStrategy: 'divisional' | 'round-robin' | 'random';
  playerPool: 'all' | 'nl' | 'al';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  waiverType: 'standard' | 'faab';
  faabBudgetDefault: number;
  isPublic: boolean;
  // Era-based league settings (LS-295)
  eraFilter: string;
  hofOnly: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
  // Salary cap settings (LS-646)
  salaryCapEnabled: boolean;
  salaryCap?: number;
  auctionBudget: number;
  auctionMinBid: number;
}

// Team count options
const TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16];

// Roster size options
const ROSTER_SIZE_OPTIONS = [20, 22, 25, 30, 35, 40];

// Player pool options
const PLAYER_POOL_OPTIONS = [
  { label: 'All MLB', value: 'all' },
  { label: 'National League', value: 'nl' },
  { label: 'American League', value: 'al' },
] as const;

// Draft mode options
const DRAFT_MODE_OPTIONS = [
  { label: 'Live Draft', value: 'live' },
  { label: 'Automated Draft', value: 'automated' },
] as const;

// Selection method options
const SELECTION_METHOD_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
] as const;

// Draft order options
const DRAFT_ORDER_OPTIONS = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
] as const;

// Division count options
const DIVISION_COUNT_OPTIONS = [1, 2, 3, 4];

// Scheduling strategy options
const SCHEDULING_STRATEGY_OPTIONS = [
  { label: 'Divisional', value: 'divisional' },
  { label: 'Round Robin', value: 'round-robin' },
  { label: 'Random', value: 'random' },
] as const;

// Era filter options (matches era_filter DB enum)
const ERA_FILTER_OPTIONS = [
  { label: 'All Eras', value: 'all' },
  { label: 'Dead Ball (pre-1920)', value: 'dead_ball' },
  { label: 'Golden Age (1920-1960)', value: 'golden_age' },
  { label: 'Expansion (1961-1976)', value: 'expansion' },
  { label: 'Free Agency (1977-1993)', value: 'free_agency' },
  { label: 'Steroid Era (1994-2005)', value: 'steroid_era' },
  { label: 'Modern (2006+)', value: 'modern' },
  { label: 'Custom Era', value: 'custom' },
] as const;

// Waiver type options
const WAIVER_TYPE_OPTIONS = [
  {
    label: 'Standard',
    value: 'standard',
    description: 'Priority order — worst team gets first pick',
  },
  {
    label: 'FAAB',
    value: 'faab',
    description: 'Bid with budget — highest bid wins the player',
  },
] as const;

// FAAB budget options
const FAAB_BUDGET_OPTIONS = [50, 100, 150, 200, 250, 500];

export function LeagueCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();
  const [formError, setFormError] = useState<string | null>(null);
  const [showWaiverUpgradeModal, setShowWaiverUpgradeModal] =
    useState<boolean>(false);
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    numberOfTeams: DEFAULT_NUM_TEAMS,
    numberOfDivisions: DEFAULT_NUM_DIVISIONS,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 25,
    draftDate: undefined,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    eraFilter: 'all',
    hofOnly: false,
    // Salary cap defaults (LS-646)
    salaryCapEnabled: false,
    salaryCap: undefined,
    auctionBudget: 200,
    auctionMinBid: 1,
  });

  const [createLeagueAndTeams, { loading, error }] =
    useCreateLeagueAndTeamsMutation({
      update: (cache, { data }) => {
        // Update the cache with the new league
        if (data?.createLeagueAndTeams?.league) {
          const newLeague = data.createLeagueAndTeams.league;

          try {
            // Read the existing user leagues from cache
            const existingData = cache.readQuery<GetUserLeaguesQuery>({
              query: GetUserLeagues,
            });

            // If we have existing data, add the new league to it
            if (existingData?.userLeagues) {
              cache.writeQuery({
                query: GetUserLeagues,
                data: {
                  userLeagues: [...existingData.userLeagues, newLeague],
                },
              });
            }
          } catch (error) {
            // If cache read fails (e.g., query hasn't been executed yet),
            // fallback to refetchQueries approach
            LOGGER.info(
              'Cache read failed, will refetch queries instead:',
              String(error),
            );
          }
        }
      },
      refetchQueries: [
        {
          query: GetUserLeagues,
        },
      ],
    });

  const trimmedLeagueName = formData.leagueName.trim();
  const isLeagueNameLengthValid = trimmedLeagueName.length >= 3;

  const handleInputChange = (
    field: keyof CreateLeagueFormData,
    value: string | number | boolean | Date | undefined,
  ) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Automated drafts only support 'random' selection method
      if (field === 'draftMode' && value === 'automated') {
        next.selectionMethod = 'random';
      }
      return next;
    });
  };

  const validateForm = (): string | null => {
    if (!trimmedLeagueName) {
      return 'Please enter a league name';
    }

    if (!isLeagueNameLengthValid) {
      return 'League name must be at least 3 characters long';
    }

    if (trimmedLeagueName.length > 50) {
      return 'League name must be less than 50 characters';
    }

    if (formData.numberOfTeams < 4 || formData.numberOfTeams > 16) {
      return 'Number of teams must be between 4 and 16';
    }

    if (formData.numberOfDivisions > formData.numberOfTeams) {
      return 'Number of divisions cannot exceed number of teams';
    }

    if (formData.maxRosterSize < 15 || formData.maxRosterSize > 50) {
      return 'Roster size must be between 15 and 50 players';
    }

    if (formData.draftDate && formData.draftDate < new Date()) {
      return 'Draft date must be in the future';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isPremium && formData.waiverType === 'faab') {
      trackPremiumFeatureClick('FAAB Waiver Settings');
      setShowWaiverUpgradeModal(true);
      setFormError('FAAB waiver settings require Premium.');
      return;
    }

    // Form validation
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      const result = await createLeagueAndTeams({
        variables: {
          input: {
            leagueName: trimmedLeagueName,
            numberOfTeams: formData.numberOfTeams,
            numberOfDivisions: formData.numberOfDivisions,
            schedulingStrategy: formData.schedulingStrategy,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            startDate: formData.draftDate
              ? formData.draftDate.toISOString()
              : undefined,
            isPublic: formData.isPublic,
            tradingEnabled: true,
            waiverEnabled: true,
            waiverType: formData.waiverType,
            faabBudgetDefault: formData.faabBudgetDefault,
            eraFilter: formData.eraFilter,
            hofOnly: formData.hofOnly,
            customEraStartYear:
              formData.eraFilter === 'custom'
                ? formData.customEraStartYear
                : undefined,
            customEraEndYear:
              formData.eraFilter === 'custom'
                ? formData.customEraEndYear
                : undefined,
            // Salary cap (LS-646)
            salaryCapEnabled: formData.salaryCapEnabled,
            salaryCap: formData.salaryCapEnabled
              ? formData.salaryCap
              : undefined,
            auctionBudget:
              formData.selectionMethod === 'auction'
                ? formData.auctionBudget
                : undefined,
            auctionMinBid:
              formData.selectionMethod === 'auction'
                ? formData.auctionMinBid
                : undefined,
          },
        },
      });

      // Handle successful creation
      if (result.data?.createLeagueAndTeams?.league?.id) {
        navigate(
          `/baseball/league/${result.data.createLeagueAndTeams.league.id}`,
        );
      }
    } catch (error) {
      LOGGER.error(
        'Error creating league:',
        error instanceof Error ? error : String(error),
      );
      setFormError(
        (error as Error).message ||
          'Failed to create league. Please try again.',
      );
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <PageMeta
        title="Create a League"
        description="Start your own fantasy baseball league on Legacy Sports. Customize draft settings, roster rules, and invite friends to compete."
      />
      <YStack
        padding="$6"
        $sm={{ padding: '$3', paddingBottom: '$6' }}
        space="$6"
        maxWidth={600}
        alignSelf="center"
        width="100%"
      >
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$8" color="$color" textAlign="center">
            <span role="img" aria-label="baseball">
              ⚾
            </span>{' '}
            Create Baseball League
          </H1>
          <Text size="$4" color="$gray11" textAlign="center">
            Set up your fantasy baseball league with custom settings
          </Text>
        </YStack>

        {/* Form Card */}
        <Card
          elevate
          size="$4"
          bordered
          backgroundColor="$color2"
          borderColor="$borderColor"
        >
          <Card.Header padded>
            <H2 size="$6" color="$color">
              League Settings
            </H2>
          </Card.Header>

          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <YStack padding="$4" space="$5">
              {/* League Name */}
              <YStack space="$2">
                <Text
                  size="$4"
                  fontWeight="600"
                  color="$gray12"
                  nativeID="label-league-name"
                >
                  League Name *
                </Text>
                <Input
                  size="$4"
                  placeholder="Enter your league name"
                  value={formData.leagueName}
                  onChangeText={(text: string) =>
                    handleInputChange('leagueName', text)
                  }
                  borderColor="$borderColor"
                  backgroundColor="$color1"
                  disabled={loading}
                  aria-labelledby="label-league-name"
                  aria-required="true"
                />
              </YStack>

              {/* Number of Teams */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Number of Teams *
                </Text>
                <XStack
                  space="$2"
                  flexWrap="wrap"
                  data-testid="team-count-select"
                >
                  {TEAM_COUNT_OPTIONS.map((count) => (
                    <Button
                      key={count}
                      size="$3"
                      variant={
                        formData.numberOfTeams === count
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('numberOfTeams', count);
                      }}
                      disabled={loading}
                      minWidth="$5"
                      backgroundColor={
                        formData.numberOfTeams === count
                          ? BRAND_NAVY_LIGHT
                          : '$color2'
                      }
                      borderColor={
                        formData.numberOfTeams === count
                          ? BRAND_NAVY_LIGHT
                          : '$borderColor'
                      }
                      borderWidth={formData.numberOfTeams === count ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.numberOfTeams === count
                            ? BRAND_NAVY
                            : '$color3',
                        borderColor:
                          formData.numberOfTeams === count
                            ? BRAND_NAVY
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.numberOfTeams === count
                            ? BRAND_NAVY_DARK
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.numberOfTeams === count
                            ? BRAND_GOLD
                            : '$color'
                        }
                        fontWeight={
                          formData.numberOfTeams === count ? '600' : '400'
                        }
                      >
                        {count}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Select between 4-16 teams for your league
                </Text>
              </YStack>

              {/* Number of Divisions */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Number of Divisions
                </Text>
                <XStack space="$2" flexWrap="wrap">
                  {DIVISION_COUNT_OPTIONS.map((count) => (
                    <Button
                      key={count}
                      size="$3"
                      variant={
                        formData.numberOfDivisions === count
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('numberOfDivisions', count);
                      }}
                      disabled={loading}
                      minWidth="$5"
                      backgroundColor={
                        formData.numberOfDivisions === count
                          ? BRAND_NAVY_LIGHT
                          : '$color2'
                      }
                      borderColor={
                        formData.numberOfDivisions === count
                          ? BRAND_NAVY_LIGHT
                          : '$borderColor'
                      }
                      borderWidth={formData.numberOfDivisions === count ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.numberOfDivisions === count
                            ? BRAND_NAVY
                            : '$color3',
                        borderColor:
                          formData.numberOfDivisions === count
                            ? BRAND_NAVY
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.numberOfDivisions === count
                            ? BRAND_NAVY_DARK
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.numberOfDivisions === count
                            ? BRAND_GOLD
                            : '$color'
                        }
                        fontWeight={
                          formData.numberOfDivisions === count ? '600' : '400'
                        }
                      >
                        {count}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  How many divisions to split your teams into
                </Text>
              </YStack>

              {/* Scheduling Strategy */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Scheduling Strategy
                </Text>
                <XStack space="$3">
                  {SCHEDULING_STRATEGY_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.schedulingStrategy === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('schedulingStrategy', option.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.schedulingStrategy === option.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.schedulingStrategy === option.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={
                        formData.schedulingStrategy === option.value ? 2 : 1
                      }
                      hoverStyle={{
                        backgroundColor:
                          formData.schedulingStrategy === option.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.schedulingStrategy === option.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.schedulingStrategy === option.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.schedulingStrategy === option.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.schedulingStrategy === option.value
                            ? '600'
                            : '400'
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Divisional schedules prioritize in-division matchups;
                  round-robin ensures all teams play each other
                </Text>
              </YStack>

              {/* Roster Size */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Roster Size *
                </Text>
                <XStack space="$2" flexWrap="wrap">
                  {ROSTER_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      size="$3"
                      variant={
                        formData.maxRosterSize === size ? 'primary' : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('maxRosterSize', size);
                      }}
                      disabled={loading}
                      minWidth="$5"
                      backgroundColor={
                        formData.maxRosterSize === size
                          ? BRAND_NAVY_LIGHT
                          : '$color2'
                      }
                      borderColor={
                        formData.maxRosterSize === size
                          ? BRAND_NAVY_LIGHT
                          : '$borderColor'
                      }
                      borderWidth={formData.maxRosterSize === size ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.maxRosterSize === size
                            ? BRAND_NAVY
                            : '$color3',
                        borderColor:
                          formData.maxRosterSize === size
                            ? BRAND_NAVY
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.maxRosterSize === size
                            ? BRAND_NAVY_DARK
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.maxRosterSize === size
                            ? BRAND_GOLD
                            : '$color'
                        }
                        fontWeight={
                          formData.maxRosterSize === size ? '600' : '400'
                        }
                      >
                        {size}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Number of players each team can have (15-50 recommended)
                </Text>
              </YStack>

              {/* Player Pool */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Player Pool *
                </Text>
                <XStack space="$3">
                  {PLAYER_POOL_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.playerPool === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('playerPool', option.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.playerPool === option.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.playerPool === option.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={formData.playerPool === option.value ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.playerPool === option.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.playerPool === option.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.playerPool === option.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.playerPool === option.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.playerPool === option.value ? '600' : '400'
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Which players can be drafted in this league
                </Text>
              </YStack>

              {/* Era Filter — Era-Based Leagues (LS-295) */}
              <PremiumGate
                isPremium={isPremium}
                featureName="Historical Era Selection"
                featureDescription="Restrict your league's player pool to a specific baseball era — a unique differentiator no live-stats platform can offer."
              >
                <YStack space="$2">
                  <Text size="$4" fontWeight="600" color="$gray12">
                    Historical Era Filter
                  </Text>
                  <Text size="$2" color="$gray10">
                    Restrict your league's player pool to a specific baseball
                    era — a unique differentiator no live-stats platform can
                    offer.
                  </Text>
                  <XStack space="$2" flexWrap="wrap">
                    {ERA_FILTER_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="$3"
                        onPress={() => {
                          handleInputChange('eraFilter', option.value);
                        }}
                        disabled={loading}
                        backgroundColor={
                          formData.eraFilter === option.value
                            ? '$orange8'
                            : '$color2'
                        }
                        borderColor={
                          formData.eraFilter === option.value
                            ? '$orange8'
                            : '$borderColor'
                        }
                        borderWidth={
                          formData.eraFilter === option.value ? 2 : 1
                        }
                        hoverStyle={{
                          backgroundColor:
                            formData.eraFilter === option.value
                              ? '$orange9'
                              : '$color3',
                        }}
                        pressStyle={{ scale: 0.95 }}
                      >
                        <Text
                          color={
                            formData.eraFilter === option.value
                              ? '$orange12'
                              : '$color'
                          }
                          fontWeight={
                            formData.eraFilter === option.value ? '600' : '400'
                          }
                          fontSize="$2"
                        >
                          {option.label}
                        </Text>
                      </Button>
                    ))}
                  </XStack>

                  {/* Custom era year range */}
                  {formData.eraFilter === 'custom' && (
                    <XStack space="$3" alignItems="center" flexWrap="wrap">
                      <YStack flex={1} space="$1">
                        <Text fontSize="$2" color="$gray10">
                          Start Year
                        </Text>
                        <Input
                          size="$3"
                          placeholder="e.g. 1940"
                          value={
                            formData.customEraStartYear !== undefined
                              ? String(formData.customEraStartYear)
                              : ''
                          }
                          onChangeText={(text: string) => {
                            const year = parseInt(text, 10);
                            handleInputChange(
                              'customEraStartYear',
                              isNaN(year) ? undefined : year,
                            );
                          }}
                          keyboardType="numeric"
                          disabled={loading}
                          borderColor="$orange8"
                        />
                      </YStack>
                      <Text color="$gray10" marginTop="$4">
                        –
                      </Text>
                      <YStack flex={1} space="$1">
                        <Text fontSize="$2" color="$gray10">
                          End Year
                        </Text>
                        <Input
                          size="$3"
                          placeholder="e.g. 1960"
                          value={
                            formData.customEraEndYear !== undefined
                              ? String(formData.customEraEndYear)
                              : ''
                          }
                          onChangeText={(text: string) => {
                            const year = parseInt(text, 10);
                            handleInputChange(
                              'customEraEndYear',
                              isNaN(year) ? undefined : year,
                            );
                          }}
                          keyboardType="numeric"
                          disabled={loading}
                          borderColor="$orange8"
                        />
                      </YStack>
                    </XStack>
                  )}
                </YStack>
              </PremiumGate>

              {/* Hall of Fame Only Toggle */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Hall of Fame Draft Mode
                </Text>
                <XStack space="$3" alignItems="center">
                  <Button
                    size="$3"
                    onPress={() => {
                      handleInputChange('hofOnly', !formData.hofOnly);
                    }}
                    disabled={loading}
                    flex={1}
                    backgroundColor={formData.hofOnly ? '$yellow8' : '$color2'}
                    borderColor={formData.hofOnly ? '$yellow8' : '$borderColor'}
                    borderWidth={formData.hofOnly ? 2 : 1}
                    hoverStyle={{
                      backgroundColor: formData.hofOnly
                        ? '$yellow9'
                        : '$color3',
                    }}
                    pressStyle={{ scale: 0.95 }}
                  >
                    <Text
                      color={formData.hofOnly ? '$yellow12' : '$color'}
                      fontWeight={formData.hofOnly ? '600' : '400'}
                    >
                      {formData.hofOnly
                        ? '🏆 Hall of Famers Only — ON'
                        : '🏆 Hall of Famers Only — OFF'}
                    </Text>
                  </Button>
                </XStack>
                <Text size="$2" color="$gray10">
                  Restrict the draft pool to Baseball Hall of Fame inductees
                  only. Creates a prestigious, high-stakes draft experience.
                </Text>
              </YStack>

              {/* Draft Mode */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Draft Mode
                </Text>
                <XStack space="$3">
                  {DRAFT_MODE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.draftMode === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('draftMode', option.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.draftMode === option.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.draftMode === option.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={formData.draftMode === option.value ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.draftMode === option.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.draftMode === option.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.draftMode === option.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.draftMode === option.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.draftMode === option.value ? '600' : '400'
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Live drafts require all managers online; automated drafts run
                  on a schedule
                </Text>
              </YStack>

              {/* Selection Method */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Selection Method
                </Text>
                <XStack space="$3">
                  {SELECTION_METHOD_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.selectionMethod === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('selectionMethod', option.value);
                      }}
                      disabled={loading || formData.draftMode === 'automated'}
                      flex={1}
                      backgroundColor={
                        formData.selectionMethod === option.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.selectionMethod === option.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={
                        formData.selectionMethod === option.value ? 2 : 1
                      }
                      hoverStyle={{
                        backgroundColor:
                          formData.selectionMethod === option.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.selectionMethod === option.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.selectionMethod === option.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.selectionMethod === option.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.selectionMethod === option.value
                            ? '600'
                            : '400'
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  {formData.draftMode === 'automated'
                    ? "Automated drafts use random player assignment. Switch to 'Live Draft' to choose a different method."
                    : 'Standard picks in order, auction bidding, or random assignment'}
                </Text>
              </YStack>

              {/* Draft Order */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Draft Order
                </Text>
                <XStack space="$3">
                  {DRAFT_ORDER_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.draftOrder === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('draftOrder', option.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.draftOrder === option.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.draftOrder === option.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={formData.draftOrder === option.value ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.draftOrder === option.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.draftOrder === option.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.draftOrder === option.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.draftOrder === option.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.draftOrder === option.value ? '600' : '400'
                        }
                      >
                        {option.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  Snake order reverses each round; linear order stays the same
                </Text>
              </YStack>

              {/* Waiver Type */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Waiver System
                </Text>
                <XStack space="$3">
                  {WAIVER_TYPE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="$3"
                      variant={
                        formData.waiverType === option.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        if (
                          option.value === 'faab' &&
                          (!isPremium || premiumLoading)
                        ) {
                          trackPremiumFeatureClick('FAAB Waiver Settings');
                          setShowWaiverUpgradeModal(true);
                          handleInputChange('waiverType', 'standard');
                          return;
                        }
                        handleInputChange('waiverType', option.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.waiverType === option.value
                          ? '$purple8'
                          : '$color2'
                      }
                      borderColor={
                        formData.waiverType === option.value
                          ? '$purple8'
                          : '$borderColor'
                      }
                      borderWidth={formData.waiverType === option.value ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.waiverType === option.value
                            ? '$purple9'
                            : '$color3',
                        borderColor:
                          formData.waiverType === option.value
                            ? '$purple9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.waiverType === option.value
                            ? '$purple7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.waiverType === option.value
                            ? '$purple12'
                            : '$color'
                        }
                        fontWeight={
                          formData.waiverType === option.value ? '600' : '400'
                        }
                      >
                        {option.label}
                        {!isPremium && option.value === 'faab'
                          ? ' (Premium)'
                          : ''}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  {formData.waiverType === 'faab'
                    ? 'Teams bid from a budget to claim free agents — highest bid wins'
                    : 'Teams have a priority order — lower-ranked teams get first pick'}
                </Text>
                {!isPremium && (
                  <Text size="$2" color="$brandGoldLight">
                    FAAB is available on Premium. Tap FAAB to view upgrade
                    options.
                  </Text>
                )}
              </YStack>

              {/* FAAB Budget (only when FAAB selected) */}
              {formData.waiverType === 'faab' && (
                <PremiumGate
                  isPremium={isPremium}
                  featureName="FAAB Waiver Settings"
                  featureDescription="Configure Free Agent Acquisition Budget (FAAB) bidding — the most competitive waiver system for serious leagues."
                >
                  <YStack space="$2">
                    <Text size="$4" fontWeight="600" color="$gray12">
                      FAAB Budget Per Team
                    </Text>
                    <XStack space="$2" flexWrap="wrap">
                      {FAAB_BUDGET_OPTIONS.map((amount) => (
                        <Button
                          key={amount}
                          size="$3"
                          variant={
                            formData.faabBudgetDefault === amount
                              ? 'primary'
                              : 'outlined'
                          }
                          onPress={() => {
                            handleInputChange('faabBudgetDefault', amount);
                          }}
                          disabled={loading}
                          minWidth="$5"
                          backgroundColor={
                            formData.faabBudgetDefault === amount
                              ? '$purple8'
                              : '$color2'
                          }
                          borderColor={
                            formData.faabBudgetDefault === amount
                              ? '$purple8'
                              : '$borderColor'
                          }
                          borderWidth={
                            formData.faabBudgetDefault === amount ? 2 : 1
                          }
                          hoverStyle={{
                            backgroundColor:
                              formData.faabBudgetDefault === amount
                                ? '$purple9'
                                : '$color3',
                            borderColor:
                              formData.faabBudgetDefault === amount
                                ? '$purple9'
                                : '$borderColorHover',
                          }}
                          pressStyle={{
                            scale: 0.95,
                            backgroundColor:
                              formData.faabBudgetDefault === amount
                                ? '$purple7'
                                : '$color4',
                          }}
                        >
                          <Text
                            color={
                              formData.faabBudgetDefault === amount
                                ? '$purple12'
                                : '$color'
                            }
                            fontWeight={
                              formData.faabBudgetDefault === amount
                                ? '600'
                                : '400'
                            }
                          >
                            ${amount}
                          </Text>
                        </Button>
                      ))}
                    </XStack>
                    <Text size="$2" color="$gray10">
                      Each team starts with this budget to bid on free agents
                      for the season
                    </Text>
                  </YStack>
                </PremiumGate>
              )}

              {/* Salary Cap */}
              <PremiumGate
                isPremium={isPremium}
                featureName="Salary Cap"
                featureDescription="Track player salaries and enforce roster spending caps for a competitive salary cap league format."
              >
                <YStack space="$3">
                  <Text size="$4" fontWeight="600" color="$gray12">
                    Salary Cap
                  </Text>
                  <XStack
                    alignItems="center"
                    gap="$3"
                    padding="$3"
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor={
                      formData.salaryCapEnabled
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                        : '$borderColor'
                    }
                    backgroundColor={
                      formData.salaryCapEnabled
                        ? withAlpha(BRAND_NAVY_LIGHT, 0.08)
                        : '$color1'
                    }
                    cursor="pointer"
                    onPress={() =>
                      handleInputChange(
                        'salaryCapEnabled',
                        !formData.salaryCapEnabled,
                      )
                    }
                  >
                    <YStack
                      width={24}
                      height={24}
                      borderRadius={12}
                      borderWidth={2}
                      borderColor={
                        formData.salaryCapEnabled
                          ? BRAND_NAVY_LIGHT
                          : '$borderColor'
                      }
                      backgroundColor={
                        formData.salaryCapEnabled
                          ? BRAND_NAVY_LIGHT
                          : 'transparent'
                      }
                      alignItems="center"
                      justifyContent="center"
                    >
                      {formData.salaryCapEnabled && (
                        <Text fontSize={14} color="white" fontWeight="700">
                          ✓
                        </Text>
                      )}
                    </YStack>
                    <YStack flex={1}>
                      <Text fontWeight="600" color="$color12">
                        Enable Salary Cap
                      </Text>
                      <Text size="$2" color="$gray10">
                        Track player salaries and enforce roster spending limits
                      </Text>
                    </YStack>
                  </XStack>

                  {formData.salaryCapEnabled && (
                    <YStack space="$2">
                      <Text size="$3" fontWeight="600" color="$gray12">
                        Salary Cap Limit
                      </Text>
                      <Input
                        value={
                          formData.salaryCap !== undefined
                            ? String(formData.salaryCap)
                            : ''
                        }
                        onChangeText={(text: string) => {
                          const n = parseInt(text, 10);
                          handleInputChange('salaryCap', isNaN(n) ? 0 : n);
                        }}
                        placeholder="e.g. 50000000"
                        keyboardType="numeric"
                        disabled={loading}
                      />
                      <Text size="$2" color="$gray10">
                        Maximum total salary each team can spend on their roster
                      </Text>
                    </YStack>
                  )}

                  {formData.selectionMethod === 'auction' && (
                    <>
                      <YStack space="$2">
                        <Text size="$3" fontWeight="600" color="$gray12">
                          Auction Budget per Team
                        </Text>
                        <Input
                          value={String(formData.auctionBudget)}
                          onChangeText={(text: string) => {
                            const n = parseInt(text, 10);
                            handleInputChange(
                              'auctionBudget',
                              isNaN(n) ? 200 : n,
                            );
                          }}
                          placeholder="200"
                          keyboardType="numeric"
                          disabled={loading}
                        />
                        <Text size="$2" color="$gray10">
                          Each team's total budget for the auction draft
                        </Text>
                      </YStack>
                      <YStack space="$2">
                        <Text size="$3" fontWeight="600" color="$gray12">
                          Minimum Bid
                        </Text>
                        <Input
                          value={String(formData.auctionMinBid)}
                          onChangeText={(text: string) => {
                            const n = parseInt(text, 10);
                            handleInputChange(
                              'auctionMinBid',
                              isNaN(n) ? 1 : n,
                            );
                          }}
                          placeholder="1"
                          keyboardType="numeric"
                          disabled={loading}
                        />
                        <Text size="$2" color="$gray10">
                          Minimum amount a team can bid on any player
                        </Text>
                      </YStack>
                    </>
                  )}
                </YStack>
              </PremiumGate>

              {/* Draft Date and Time */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Draft Date & Time
                </Text>
                <DateTimePicker
                  value={formData.draftDate}
                  onChange={(date: Date) =>
                    handleInputChange('draftDate', date)
                  }
                  onClear={() =>
                    setFormData((prev) => ({ ...prev, draftDate: undefined }))
                  }
                  placeholder="Select draft date and time"
                  disabled={loading}
                  minDate={new Date()} // Can't select past dates
                  useNativeInput={false} // Use custom picker popup on web
                />
                <Text size="$2" color="$gray10">
                  Optional. You can set or change your draft date after creating
                  the league.
                </Text>
              </YStack>

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

              {/* League Visibility */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  League Visibility
                </Text>
                <XStack space="$3">
                  <Button
                    size="$3"
                    variant={!formData.isPublic ? 'primary' : 'outlined'}
                    onPress={() => handleInputChange('isPublic', false)}
                    disabled={loading}
                    flex={1}
                    backgroundColor={
                      !formData.isPublic ? BRAND_NAVY_LIGHT : '$color2'
                    }
                    borderColor={
                      !formData.isPublic ? BRAND_NAVY_LIGHT : '$borderColor'
                    }
                    borderWidth={!formData.isPublic ? 2 : 1}
                    hoverStyle={{
                      backgroundColor: !formData.isPublic
                        ? BRAND_NAVY
                        : '$color3',
                      borderColor: !formData.isPublic
                        ? BRAND_NAVY
                        : '$borderColorHover',
                    }}
                    pressStyle={{ scale: 0.95 }}
                  >
                    <Text
                      color={!formData.isPublic ? BRAND_GOLD : '$color'}
                      fontWeight={!formData.isPublic ? '600' : '400'}
                    >
                      <span role="img" aria-label="private">
                        🔒
                      </span>{' '}
                      Private
                    </Text>
                  </Button>
                  <Button
                    size="$3"
                    variant={formData.isPublic ? 'primary' : 'outlined'}
                    onPress={() => handleInputChange('isPublic', true)}
                    disabled={loading}
                    flex={1}
                    backgroundColor={
                      formData.isPublic ? BRAND_NAVY_LIGHT : '$color2'
                    }
                    borderColor={
                      formData.isPublic ? BRAND_NAVY_LIGHT : '$borderColor'
                    }
                    borderWidth={formData.isPublic ? 2 : 1}
                    hoverStyle={{
                      backgroundColor: formData.isPublic
                        ? BRAND_NAVY
                        : '$color3',
                      borderColor: formData.isPublic
                        ? BRAND_NAVY
                        : '$borderColorHover',
                    }}
                    pressStyle={{ scale: 0.95 }}
                  >
                    <Text
                      color={formData.isPublic ? BRAND_GOLD : '$color'}
                      fontWeight={formData.isPublic ? '600' : '400'}
                    >
                      <span role="img" aria-label="public">
                        🌐
                      </span>{' '}
                      Public
                    </Text>
                  </Button>
                </XStack>
                <Text size="$2" color="$gray10">
                  {formData.isPublic
                    ? 'Anyone can browse and join this league without an invite code'
                    : 'Only people with your invite code can join this league'}
                </Text>
              </YStack>

              {/* Inline error banner */}
              {formError && (
                <Card
                  role="alert"
                  aria-live="assertive"
                  backgroundColor="$red3"
                  borderColor="$red8"
                  padding="$3"
                  borderRadius="$4"
                >
                  <Text color="$red11" fontWeight="bold">
                    {formError}
                  </Text>
                </Card>
              )}

              {/* Action Buttons */}
              <XStack space="$3" justifyContent="flex-end" marginTop="$4">
                <Button
                  size="$4"
                  variant="secondary"
                  onPress={() => navigate('/baseball')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  size="$4"
                  variant="primary"
                  type="submit"
                  disabled={loading || !isLeagueNameLengthValid}
                  opacity={loading ? 0.6 : 1}
                >
                  {loading ? 'Creating...' : 'Create League'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </Card>

        {/* Info Card */}
        <Card
          size="$4"
          bordered
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        >
          <Card.Header padded>
            <H2 size="$5" color={BRAND_GOLD}>
              What happens next?
            </H2>
          </Card.Header>
          <YStack padding="$4" space="$3">
            <Text size="$3" color={BRAND_GOLD}>
              • Your league will be created with the specified number of teams
            </Text>
            <Text size="$3" color={BRAND_GOLD}>
              • You'll be set as the league commissioner
            </Text>
            <Text size="$3" color={BRAND_GOLD}>
              • Teams will be auto-generated and ready for member assignment
            </Text>
            <Text size="$3" color={BRAND_GOLD}>
              • You can invite friends to join your league after creation
            </Text>
          </YStack>
        </Card>
      </YStack>

      <UpgradeModal
        open={showWaiverUpgradeModal}
        onOpenChange={setShowWaiverUpgradeModal}
        featureName="FAAB Waiver Settings"
        featureDescription="Use Free Agent Acquisition Budget (FAAB) bidding for waiver claims, where the highest bid wins."
      />
    </ScrollView>
  );
}

export default LeagueCreatePage;
