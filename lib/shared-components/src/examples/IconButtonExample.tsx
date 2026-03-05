import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Text } from 'tamagui';
import { IconButton } from '../IconButton';
import { XStack, YStack } from '../Layout';

/**
 * Example usage of the IconButton component
 *
 * This component demonstrates various ways to use the IconButton
 * with different variants, colors, and sizes - similar to the
 * CodePen example with hover effects and gradient shadows.
 */
export function IconButtonExample() {
  const handlePress = (action: string) => {
    LOGGER.debug(`${action} button pressed`);
  };

  return (
    <YStack padding="$4" gap="$6" backgroundColor="$color1">
      {/* Navigation Bar Example */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Navigation Bar
        </Text>
        <XStack
          gap="$4"
          alignItems="center"
          justifyContent="center"
          padding="$4"
          backgroundColor="$color2"
          borderRadius="$4"
        >
          <IconButton
            icon="home"
            label="Home"
            variant="primary"
            colorScheme="blue"
            onPress={() => handlePress('Home')}
          />
          <IconButton
            icon="search"
            label="Search"
            variant="default"
            colorScheme="blue"
            onPress={() => handlePress('Search')}
          />
          <IconButton
            icon="star"
            label="Favorites"
            variant="default"
            colorScheme="blue"
            onPress={() => handlePress('Favorites')}
          />
          <IconButton
            icon="user"
            label="Profile"
            variant="default"
            colorScheme="blue"
            onPress={() => handlePress('Profile')}
          />
        </XStack>
      </YStack>

      {/* Different Sizes */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Different Sizes
        </Text>
        <XStack gap="$4" alignItems="center" justifyContent="center">
          <IconButton
            icon="star"
            label="Small"
            size="sm"
            variant="primary"
            colorScheme="gold"
            onPress={() => handlePress('Small')}
          />
          <IconButton
            icon="star"
            label="Medium"
            size="md"
            variant="primary"
            colorScheme="gold"
            onPress={() => handlePress('Medium')}
          />
          <IconButton
            icon="star"
            label="Large"
            size="lg"
            variant="primary"
            colorScheme="gold"
            onPress={() => handlePress('Large')}
          />
        </XStack>
      </YStack>

      {/* Color Schemes */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Color Schemes
        </Text>
        <XStack gap="$4" alignItems="center" justifyContent="center">
          <IconButton
            icon="heart"
            label="Like"
            variant="primary"
            colorScheme="red"
            onPress={() => handlePress('Like')}
          />
          <IconButton
            icon="check"
            label="Done"
            variant="accent"
            colorScheme="green"
            onPress={() => handlePress('Done')}
          />
          <IconButton
            icon="settings"
            label="Settings"
            variant="secondary"
            colorScheme="purple"
            onPress={() => handlePress('Settings')}
          />
        </XStack>
      </YStack>

      {/* Action Grid */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Action Grid
        </Text>
        <YStack gap="$4" alignItems="center">
          <XStack gap="$4">
            <IconButton
              icon="plus"
              label="Add Player"
              variant="primary"
              colorScheme="green"
              size="lg"
              onPress={() => handlePress('Add Player')}
            />
            <IconButton
              icon="edit"
              label="Edit Team"
              variant="secondary"
              colorScheme="blue"
              size="lg"
              onPress={() => handlePress('Edit Team')}
            />
          </XStack>
          <XStack gap="$4">
            <IconButton
              icon="star"
              label="Favorite"
              variant="accent"
              colorScheme="gold"
              size="lg"
              onPress={() => handlePress('Favorite')}
            />
            <IconButton
              icon="delete"
              label="Remove"
              variant="primary"
              colorScheme="red"
              size="lg"
              onPress={() => handlePress('Remove')}
            />
          </XStack>
        </YStack>
      </YStack>

      {/* Without Gradient */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Without Gradient Effect
        </Text>
        <XStack gap="$4" alignItems="center" justifyContent="center">
          <IconButton
            icon="home"
            label="No Gradient"
            variant="default"
            showGradient={false}
            onPress={() => handlePress('No Gradient')}
          />
          <IconButton
            icon="star"
            label="With Gradient"
            variant="primary"
            colorScheme="blue"
            showGradient={true}
            onPress={() => handlePress('With Gradient')}
          />
        </XStack>
      </YStack>
    </YStack>
  );
}

// Example for use in web app
export function WebIconButtonExample() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Legacy Sports Icon Buttons</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <IconButton
          icon="home"
          label="Home"
          variant="primary"
          colorScheme="blue"
          onPress={() => alert('Home pressed')}
        />
        <IconButton
          icon="search"
          label="Search"
          variant="secondary"
          colorScheme="purple"
          onPress={() => alert('Search pressed')}
        />
        <IconButton
          icon="star"
          label="Favorites"
          variant="accent"
          colorScheme="gold"
          onPress={() => alert('Favorites pressed')}
        />
      </div>
    </div>
  );
}

// Example for use in React Native app
export function NativeIconButtonExample() {
  return (
    <YStack flex={1} padding="$4" backgroundColor="$color1">
      <Text fontSize="$7" fontWeight="bold" color="$color" marginBottom="$4">
        Sports App Actions
      </Text>

      <XStack gap="$4" justifyContent="center" marginBottom="$6">
        <IconButton
          icon="plus"
          label="Add Game"
          variant="primary"
          colorScheme="green"
          onPress={() => LOGGER.debug('Add Game')}
        />
        <IconButton
          icon="star"
          label="Favorites"
          variant="secondary"
          colorScheme="gold"
          onPress={() => LOGGER.debug('Favorites')}
        />
      </XStack>

      <XStack gap="$4" justifyContent="center">
        <IconButton
          icon="settings"
          label="Settings"
          variant="default"
          colorScheme="blue"
          onPress={() => LOGGER.debug('Settings')}
        />
        <IconButton
          icon="user"
          label="Profile"
          variant="default"
          colorScheme="purple"
          onPress={() => LOGGER.debug('Profile')}
        />
      </XStack>
    </YStack>
  );
}
