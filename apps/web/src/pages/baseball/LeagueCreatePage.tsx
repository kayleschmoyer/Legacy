import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, H1, H2, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Button, DateTimePicker } from '@legacy-sports/shared-components';
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

// Now using codegen-generated hooks and types

// Import types and configurations
interface CreateLeagueFormData {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nl' | 'al';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  waiverType: 'standard' | 'faab';
  faabBudgetDefault: number;
}

// Team count options
const TEAM_COUNT_OPTIONS = [6, 8, 10, 12, 14, 16];

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
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    numberOfTeams: 12,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 25,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    waiverType: 'standard',
    faabBudgetDefault: 100,
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
    if (!formData.leagueName.trim()) {
      return 'Please enter a league name';
    }

    if (formData.leagueName.trim().length < 3) {
      return 'League name must be at least 3 characters long';
    }

    if (formData.leagueName.trim().length > 50) {
      return 'League name must be less than 50 characters';
    }

    if (formData.numberOfTeams < 6 || formData.numberOfTeams > 16) {
      return 'Number of teams must be between 6 and 16';
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
            waiverType: formData.waiverType,
            faabBudgetDefault: formData.faabBudgetDefault,
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
                  Select between 6-16 teams for your league
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
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  {formData.waiverType === 'faab'
                    ? 'Teams bid from a budget to claim free agents — highest bid wins'
                    : 'Teams have a priority order — lower-ranked teams get first pick'}
                </Text>
              </YStack>

              {/* FAAB Budget (only when FAAB selected) */}
              {formData.waiverType === 'faab' && (
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
                    Each team starts with this budget to bid on free agents for
                    the season
                  </Text>
                </YStack>
              )}

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
    </ScrollView>
  );
}

export default LeagueCreatePage;
