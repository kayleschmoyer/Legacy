import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Button, H2, H4, ScrollView, Text, XStack, YStack } from 'tamagui';
import { Dimensions, Platform } from '../../platform-components';
import { SPORT_CONFIGS } from '../../config/sports';

// Use a function to get screen width to avoid module-level execution issues in tests
const getScreenWidth = () => {
  try {
    return Dimensions?.get?.('window')?.width || 375;
  } catch {
    return 375; // Default width for tests
  }
};

export interface ActionCardProps {
  title: string;
  icon?: string;
  onPress: () => void;
  color?: string;
}

export interface SportOption {
  key: string;
  name: string;
  icon?: string;
  enabled?: boolean;
}

export interface HomeScreenProps {
  title?: string;
  subtitle?: string;
  sports?: SportOption[];
  onSportPress: (sportKey: string) => void;
  customActions?: ActionCardProps[];
  showAllSports?: boolean;
}

function HomeScreen({
  title = 'Fantasy Sports Hub',
  subtitle = 'Choose your sport',
  sports,
  onSportPress,
  customActions = [],
  showAllSports = true,
}: HomeScreenProps) {
  // Default to all configured sports if none provided
  const defaultSports: SportOption[] = Object.keys(SPORT_CONFIGS).map(
    (key) => ({
      key,
      name: SPORT_CONFIGS[key].name,
      icon: '🏆', // Default icon since SportConfig doesn't have icon property
      enabled: true,
    }),
  );

  const allSports = sports || defaultSports;
  const sportsToShow = showAllSports
    ? allSports
    : allSports.filter((sport) => sport.enabled !== false);

  const quickActions = [
    {
      title: 'Quick Pick',
      icon: '⚡',
      onPress: () => LOGGER.info('Quick Pick'),
    },
    {
      title: 'Manage Teams',
      icon: '👥',
      onPress: () => LOGGER.info('Manage Teams'),
    },
    ...customActions,
  ];

  const renderSportCard = (sport: SportOption) => {
    const isEnabled = sport.enabled !== false;

    return (
      <Button
        key={sport.key}
        onPress={() => isEnabled && onSportPress(sport.key)}
        disabled={!isEnabled}
        backgroundColor="white"
        borderRadius="$4"
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={120}
        width={(getScreenWidth() - 60) / 2}
        shadowColor="$shadowColor"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.1}
        shadowRadius={8}
        elevation={3}
        borderWidth={1}
        borderColor="$gray4"
        opacity={isEnabled ? 1 : 0.6}
        unstyled
      >
        <YStack alignItems="center" gap="$2">
          <Text fontSize="$8" color="$blue10">
            {sport.icon || '🏆'}
          </Text>
          <Text
            fontSize="$4"
            fontWeight="600"
            color={isEnabled ? '$gray12' : '$gray8'}
            textAlign="center"
          >
            {sport.name}
          </Text>
        </YStack>
      </Button>
    );
  };

  const renderActionCard = (action: ActionCardProps, index: number) => (
    <Button
      key={index}
      onPress={action.onPress}
      backgroundColor={action.color || '$gray3'}
      borderRadius="$3"
      padding="$4"
      alignItems="center"
      flex={1}
      borderWidth={1}
      borderColor="$gray5"
      unstyled
    >
      <YStack alignItems="center" gap="$2">
        {action.icon && (
          <Text fontSize="$6" color="$blue10">
            {action.icon}
          </Text>
        )}
        <Text fontSize="$3" fontWeight="500" color="$gray12" textAlign="center">
          {action.title}
        </Text>
      </YStack>
    </Button>
  );

  return (
    <ScrollView flex={1} showsVerticalScrollIndicator={false}>
      <YStack flexGrow={1} paddingBottom="$4">
        {/* Header */}
        <YStack
          alignItems="center"
          marginBottom="$7"
          paddingTop="$4"
          paddingHorizontal="$4"
        >
          <H2 color="$gray12" marginBottom="$2" textAlign="center">
            {title}
          </H2>
          <Text color="$gray10" textAlign="center" lineHeight="$1">
            {subtitle}
          </Text>
        </YStack>

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <YStack marginBottom="$7">
            <H4 color="$gray12" marginBottom="$4" paddingHorizontal="$4">
              Quick Actions
            </H4>
            <XStack paddingHorizontal="$3" gap="$3">
              {quickActions.map(renderActionCard)}
            </XStack>
          </YStack>
        )}

        {/* Sports */}
        <YStack marginBottom="$7">
          <H4 color="$gray12" marginBottom="$4" paddingHorizontal="$4">
            Sports
          </H4>
          <XStack flexWrap="wrap" paddingHorizontal="$3" gap="$3">
            {sportsToShow.length > 0 ? (
              sportsToShow.map(renderSportCard)
            ) : (
              <YStack
                alignItems="center"
                justifyContent="center"
                padding="$15"
                flex={1}
              >
                <Text fontSize="$12" color="$gray6" marginBottom="$4">
                  {Platform?.OS === 'web' ? '🚫' : '❌'}
                </Text>
                <Text
                  fontSize="$5"
                  fontWeight="600"
                  color="$gray8"
                  marginBottom="$2"
                  textAlign="center"
                >
                  No Sports Available
                </Text>
                <Text
                  fontSize="$3"
                  color="$gray8"
                  textAlign="center"
                  lineHeight="$1"
                >
                  Check back later for available sports
                </Text>
              </YStack>
            )}
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

export { HomeScreen };
