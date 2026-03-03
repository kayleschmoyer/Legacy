import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, H1, H2, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Button, DateTimePicker } from '@legacy-sports/shared-components';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
} from '../../api/db/graphql.generated';

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
  // Era-based league settings (LS-295)
  eraFilter: string;
  hofOnly: boolean;
  customEraStartYear?: number;
  customEraEndYear?: number;
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

export function LeagueCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    numberOfTeams: 10,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 25,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    // Era settings — default to no restriction
    eraFilter: 'all',
    hofOnly: false,
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
            console.log(
              'Cache read failed, will refetch queries instead:',
              error,
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

  const handleInputChange = (
    field: keyof CreateLeagueFormData,
    value: string | number | boolean | Date,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.leagueName.trim()) {
      return 'Please enter a league name';
    }

    if (formData.leagueName.trim().length < 3) {
      return 'League name must be at least 3 characters long';
    }

    if (formData.leagueName.trim().length > 50) {
      return 'League name must be less than 50 characters';
    }

    if (formData.numberOfTeams < 4 || formData.numberOfTeams > 16) {
      return 'Number of teams must be between 4 and 16';
    }

    if (formData.maxRosterSize < 15 || formData.maxRosterSize > 50) {
      return 'Roster size must be between 15 and 50 players';
    }

    if (!formData.draftDate) {
      return 'Please select a draft date';
    }

    if (formData.draftDate < new Date()) {
      return 'Draft date must be in the future';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Form validation
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      const result = await createLeagueAndTeams({
        variables: {
          input: {
            leagueName: formData.leagueName.trim(),
            numberOfTeams: formData.numberOfTeams,
            numberOfDivisions: formData.numberOfDivisions,
            schedulingStrategy: formData.schedulingStrategy,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            startDate: formData.draftDate
              ? formData.draftDate.toISOString().split('T')[0]
              : undefined,
            isPublic: false,
            tradingEnabled: true,
            waiverEnabled: true,
            // Era-based settings
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
      console.error('Error creating league:', error);
      alert(
        (error as Error).message ||
          'Failed to create league. Please try again.',
      );
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$6" space="$6" maxWidth={600} alignSelf="center">
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
                <XStack space="$2" flexWrap="wrap">
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
                        formData.numberOfTeams === count ? '$blue8' : '$color2'
                      }
                      borderColor={
                        formData.numberOfTeams === count
                          ? '$blue8'
                          : '$borderColor'
                      }
                      borderWidth={formData.numberOfTeams === count ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.numberOfTeams === count
                            ? '$blue9'
                            : '$color3',
                        borderColor:
                          formData.numberOfTeams === count
                            ? '$blue9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.numberOfTeams === count
                            ? '$blue7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.numberOfTeams === count
                            ? '$blue12'
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
                          ? '$blue8'
                          : '$color2'
                      }
                      borderColor={
                        formData.numberOfDivisions === count
                          ? '$blue8'
                          : '$borderColor'
                      }
                      borderWidth={formData.numberOfDivisions === count ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.numberOfDivisions === count
                            ? '$blue9'
                            : '$color3',
                        borderColor:
                          formData.numberOfDivisions === count
                            ? '$blue9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.numberOfDivisions === count
                            ? '$blue7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.numberOfDivisions === count
                            ? '$blue12'
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
                        formData.maxRosterSize === size ? '$blue8' : '$color2'
                      }
                      borderColor={
                        formData.maxRosterSize === size
                          ? '$blue8'
                          : '$borderColor'
                      }
                      borderWidth={formData.maxRosterSize === size ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.maxRosterSize === size
                            ? '$blue9'
                            : '$color3',
                        borderColor:
                          formData.maxRosterSize === size
                            ? '$blue9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.maxRosterSize === size
                            ? '$blue7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.maxRosterSize === size ? '$blue12' : '$color'
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
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Historical Era Filter
                </Text>
                <Text size="$2" color="$gray10">
                  Restrict your league's player pool to a specific baseball era
                  — a unique differentiator no live-stats platform can offer.
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
                      borderWidth={formData.eraFilter === option.value ? 2 : 1}
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
                            isNaN(year) ? '' : year,
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
                            isNaN(year) ? '' : year,
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
                      disabled={loading}
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
                  Standard picks in order, auction bidding, or random assignment
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
                  placeholder="Select draft date and time"
                  disabled={loading}
                  minDate={new Date()} // Can't select past dates
                  useNativeInput={false} // Use custom picker popup on web
                />
                <Text size="$2" color="$gray10">
                  When do you want to hold your draft? Include the time for
                  scheduling.
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
                  disabled={loading || !formData.leagueName.trim()}
                  opacity={loading ? 0.6 : 1}
                >
                  {loading ? 'Creating...' : 'Create League'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </Card>

        {/* Info Card */}
        <Card size="$4" bordered backgroundColor="$blue2" borderColor="$blue6">
          <Card.Header padded>
            <H2 size="$5" color="$blue11">
              What happens next?
            </H2>
          </Card.Header>
          <YStack padding="$4" space="$3">
            <Text size="$3" color="$blue11">
              • Your league will be created with the specified number of teams
            </Text>
            <Text size="$3" color="$blue11">
              • You'll be set as the league commissioner
            </Text>
            <Text size="$3" color="$blue11">
              • Teams will be auto-generated and ready for member assignment
            </Text>
            <Text size="$3" color="$blue11">
              • You can invite friends to join your league after creation
            </Text>
          </YStack>
        </Card>
      </YStack>
    </ScrollView>
  );
}

export default LeagueCreatePage;
