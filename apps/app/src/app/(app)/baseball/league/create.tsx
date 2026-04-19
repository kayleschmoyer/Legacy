/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- Legacy mobile code pending type improvements */
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
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { DateTimePicker } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  CreateLeagueMutation,
  useCreateLeagueMutation,
} from '../../../../api/db/graphql.generated';

// Types
interface CreateLeagueFormData {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nl' | 'al';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
}

// Team count options
const TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16];

// Roster size options
const ROSTER_SIZE_OPTIONS = [20, 22, 25, 30, 35, 40];

// Player pool options
const PLAYER_POOL_OPTIONS = [
  { label: 'All MLB', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
] as const;

// Draft mode options
const DRAFT_MODE_OPTIONS = [
  { label: 'Live', value: 'live' },
  { label: 'Auto', value: 'automated' },
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

export function LeagueCreatePage(): React.JSX.Element {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    numberOfTeams: 12,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 25,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const [createLeagueAndTeams, { loading, error }] = useCreateLeagueMutation({
    onCompleted: (data: CreateLeagueMutation) => {
      if (data.createLeagueAndTeams?.league?.id) {
        // Navigate to the newly created league
        router.push(`/baseball/league/${data.createLeagueAndTeams.league.id}`);
      }
    },
    onError: (error: any) => {
      LOGGER.error(
        'Error creating league:',
        error instanceof Error ? error : String(error),
      );
      Alert.alert('Error', error.message || 'Failed to create league');
    },
  });

  const trimmedLeagueName = formData.leagueName.trim();
  const isLeagueNameLengthValid = trimmedLeagueName.length >= 3;

  const handleInputChange = (field: keyof CreateLeagueFormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
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

  const handleSubmit = async () => {
    // Form validation
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Error', validationError);
      return;
    }

    try {
      await createLeagueAndTeams({
        variables: {
          input: {
            leagueName: formData.leagueName.trim(),
            numberOfTeams: formData.numberOfTeams,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            startDate: formData.draftDate.toISOString().split('T')[0],
          },
        },
      });
    } catch (error) {
      LOGGER.error('Error in handleSubmit:', String(error));
      Alert.alert('Error', 'Failed to create league. Please try again.');
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      <YStack space="$6" maxWidth={600} alignSelf="center" width="100%">
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$8" color="$color" textAlign="center">
            <Text>⚾ Create Baseball League</Text>
          </H1>
          <Text size="$4" color="$gray11" textAlign="center">
            Set up your fantasy baseball league
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
          <YStack space="$4">
            <H2 size="$6" color="$color" marginBottom="$2">
              League Settings
            </H2>

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
                      formData.numberOfTeams === count ? 'active' : 'outlined'
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
                    shadowColor={
                      formData.numberOfTeams === count
                        ? '$shadowColor'
                        : 'transparent'
                    }
                    shadowOpacity={formData.numberOfTeams === count ? 0.3 : 0}
                    shadowRadius={formData.numberOfTeams === count ? 4 : 0}
                    elevation={formData.numberOfTeams === count ? 3 : 1}
                    pressStyle={{
                      scale: 0.95,
                      backgroundColor:
                        formData.numberOfTeams === count ? '$blue7' : '$color4',
                    }}
                  >
                    <Text
                      color={
                        formData.numberOfTeams === count ? '$blue12' : '$color'
                      }
                      fontWeight={
                        formData.numberOfTeams === count ? '700' : '500'
                      }
                      fontSize={formData.numberOfTeams === count ? '$4' : '$3'}
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
                      formData.maxRosterSize === size ? 'active' : 'outlined'
                    }
                    onPress={() => handleInputChange('maxRosterSize', size)}
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
                    shadowColor={
                      formData.maxRosterSize === size
                        ? '$shadowColor'
                        : 'transparent'
                    }
                    shadowOpacity={formData.maxRosterSize === size ? 0.3 : 0}
                    shadowRadius={formData.maxRosterSize === size ? 4 : 0}
                    elevation={formData.maxRosterSize === size ? 3 : 1}
                    pressStyle={{
                      scale: 0.95,
                      backgroundColor:
                        formData.maxRosterSize === size ? '$blue7' : '$color4',
                    }}
                  >
                    <Text
                      color={
                        formData.maxRosterSize === size ? '$blue12' : '$color'
                      }
                      fontWeight={
                        formData.maxRosterSize === size ? '700' : '500'
                      }
                      fontSize={formData.maxRosterSize === size ? '$4' : '$3'}
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
                        ? 'active'
                        : 'outlined'
                    }
                    onPress={() =>
                      handleInputChange('playerPool', option.value)
                    }
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
                    elevation={formData.playerPool === option.value ? 3 : 1}
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
                        formData.playerPool === option.value ? '700' : '500'
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
                        ? 'active'
                        : 'outlined'
                    }
                    onPress={() => handleInputChange('draftMode', option.value)}
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
                    elevation={formData.draftMode === option.value ? 3 : 1}
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
                        formData.draftMode === option.value ? '700' : '500'
                      }
                    >
                      {option.label}
                    </Text>
                  </Button>
                ))}
              </XStack>
              <Text size="$2" color="$gray10">
                Live requires all managers online; automated runs on a schedule
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
                        ? 'active'
                        : 'outlined'
                    }
                    onPress={() =>
                      handleInputChange('selectionMethod', option.value)
                    }
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
                    elevation={
                      formData.selectionMethod === option.value ? 3 : 1
                    }
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
                          ? '700'
                          : '500'
                      }
                    >
                      {option.label}
                    </Text>
                  </Button>
                ))}
              </XStack>
              <Text size="$2" color="$gray10">
                Standard picks, auction bidding, or random assignment
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
                        ? 'active'
                        : 'outlined'
                    }
                    onPress={() =>
                      handleInputChange('draftOrder', option.value)
                    }
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
                    elevation={formData.draftOrder === option.value ? 3 : 1}
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
                        formData.draftOrder === option.value ? '700' : '500'
                      }
                    >
                      {option.label}
                    </Text>
                  </Button>
                ))}
              </XStack>
              <Text size="$2" color="$gray10">
                Snake order reverses each round; linear stays the same
              </Text>
            </YStack>

            {/* Draft Date and Time */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Draft Date & Time
              </Text>
              <DateTimePicker
                value={formData.draftDate}
                onChange={(date: Date) => handleInputChange('draftDate', date)}
                placeholder="Select draft date and time"
                disabled={loading}
                minDate={new Date()} // Can't select past dates
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
                variant="outlined"
                onPress={() => router.back()}
                disabled={loading}
                backgroundColor="$color1"
                borderColor="$borderColor"
              >
                <Text color="$color">Cancel</Text>
              </Button>
              <Button
                size="$4"
                onPress={handleSubmit}
                disabled={loading || !isLeagueNameLengthValid}
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

        {/* Info Card */}
        <Card
          size="$4"
          bordered
          backgroundColor="$blue2"
          borderColor="$blue6"
          padding="$4"
        >
          <YStack space="$3">
            <H2 size="$5" color="$blue11">
              What happens next?
            </H2>
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
