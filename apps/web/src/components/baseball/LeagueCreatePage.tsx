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
  draftType: 'NORMAL' | 'BLIND' | 'RANDOM-DRAFT';
  maxRosterSize: number;
  draftDate?: Date;
}

// Team count options
const TEAM_COUNT_OPTIONS = [6, 8, 10, 12, 14, 16];

// Roster size options
const ROSTER_SIZE_OPTIONS = [20, 22, 25, 30, 35, 40];

// Draft type options
const DRAFT_TYPES = [
  { label: 'Standard Draft', value: 'NORMAL' },
  { label: 'Blind Draft', value: 'BLIND' },
  { label: 'Random Draft', value: 'RANDOM-DRAFT' },
] as const;

export function LeagueCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    numberOfTeams: 10,
    draftType: 'NORMAL',
    maxRosterSize: 25, // Default to 25 players
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 1 week from now
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
            draftType: formData.draftType,
            maxRosterSize: formData.maxRosterSize,
            startDate: formData.draftDate
              ? formData.draftDate.toISOString().split('T')[0]
              : undefined, // Format as YYYY-MM-DD
            isPublic: false, // Default to private leagues
            tradingEnabled: true, // Default settings
            waiverEnabled: true,
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
                <Text size="$4" fontWeight="600" color="$gray12">
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

              {/* Draft Type */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Draft Type *
                </Text>
                <XStack space="$3">
                  {DRAFT_TYPES.map((type) => (
                    <Button
                      key={type.value}
                      size="$3"
                      variant={
                        formData.draftType === type.value
                          ? 'primary'
                          : 'outlined'
                      }
                      onPress={() => {
                        handleInputChange('draftType', type.value);
                      }}
                      disabled={loading}
                      flex={1}
                      backgroundColor={
                        formData.draftType === type.value
                          ? '$green8'
                          : '$color2'
                      }
                      borderColor={
                        formData.draftType === type.value
                          ? '$green8'
                          : '$borderColor'
                      }
                      borderWidth={formData.draftType === type.value ? 2 : 1}
                      hoverStyle={{
                        backgroundColor:
                          formData.draftType === type.value
                            ? '$green9'
                            : '$color3',
                        borderColor:
                          formData.draftType === type.value
                            ? '$green9'
                            : '$borderColorHover',
                      }}
                      pressStyle={{
                        scale: 0.95,
                        backgroundColor:
                          formData.draftType === type.value
                            ? '$green7'
                            : '$color4',
                      }}
                    >
                      <Text
                        color={
                          formData.draftType === type.value
                            ? '$green12'
                            : '$color'
                        }
                        fontWeight={
                          formData.draftType === type.value ? '600' : '400'
                        }
                      >
                        {type.label}
                      </Text>
                    </Button>
                  ))}
                </XStack>
                <Text size="$2" color="$gray10">
                  {formData.draftType === 'NORMAL'
                    ? 'Standard draft where you can see other picks'
                    : formData.draftType === 'BLIND'
                      ? 'Blind draft where picks are hidden until reveal'
                      : 'Random draft where players are automatically assigned to teams'}
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
