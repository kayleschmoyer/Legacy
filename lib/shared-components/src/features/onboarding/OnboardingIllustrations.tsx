import React from 'react';
import { Paragraph, Text, XStack, YStack } from 'tamagui';
import {
  ONBOARDING_SAMPLE_GAME_SLOTS,
  ONBOARDING_SAMPLE_SEASON,
  ONBOARDING_SAMPLE_TOP_PERFORMERS,
  ONBOARDING_SAMPLE_WEEK_LABEL,
} from './onboardingSteps';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

/**
 * Default (simple, Tamagui-only) illustrations for the tutorial's `slot`
 * blocks. Hosts can replace either through `OnboardingTutorial`'s `slots`.
 * Surfaces use theme tokens so light/dark follow the active Tamagui theme.
 */

/** Game slots example table. */
export function GameSlotsExample(): React.JSX.Element {
  return (
    <YStack
      borderRadius="$5"
      borderWidth={1}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
      backgroundColor="$surfaceSubtle"
      overflow="hidden"
    >
      <XStack
        padding="$3"
        borderBottomWidth={1}
        borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
      >
        <Paragraph fontWeight="700" color="$brandGold" fontSize="$3">
          Example — Week 7 Game Slots (5 games) · {ONBOARDING_SAMPLE_SEASON}{' '}
          season
        </Paragraph>
      </XStack>
      <YStack padding="$3" gap="$2">
        {ONBOARDING_SAMPLE_GAME_SLOTS.map(({ slot, matchup, date }) => (
          <XStack
            key={slot}
            justifyContent="space-between"
            alignItems="center"
            padding="$2"
            borderRadius="$3"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
          >
            <XStack gap="$2" alignItems="center">
              <Paragraph
                color="$brandGold"
                fontSize="$2"
                fontWeight="700"
                minWidth={52}
              >
                {slot}
              </Paragraph>
              <Paragraph color="$colorPress" fontSize="$3">
                {matchup}
              </Paragraph>
            </XStack>
            <Paragraph color="$brandGoldLight" fontSize="$2" fontWeight="700">
              {date} ✓
            </Paragraph>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

/** Sample matchup card. */
export function SampleMatchupCard(): React.JSX.Element {
  return (
    <YStack
      borderRadius="$6"
      borderWidth={1}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
      backgroundColor="$surfaceSubtle"
      overflow="hidden"
    >
      <XStack
        justifyContent="center"
        padding="$3"
        borderBottomWidth={1}
        borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
      >
        <Paragraph color="$brandGoldLight" fontWeight="700" fontSize="$3">
          {ONBOARDING_SAMPLE_WEEK_LABEL}
        </Paragraph>
      </XStack>

      <XStack justifyContent="space-around" alignItems="center" padding="$4">
        <YStack alignItems="center" gap="$2">
          <Paragraph fontSize={32} lineHeight={36}>
            <Text role="img" aria-label="sloth">
              {'🦥'}
            </Text>
          </Paragraph>
          <Paragraph fontWeight="700" color="$color" fontSize="$4">
            Your Team
          </Paragraph>
          <Paragraph
            fontWeight="800"
            fontSize={28}
            lineHeight={32}
            color="$brandGoldLight"
          >
            87.5
          </Paragraph>
        </YStack>

        <YStack alignItems="center" gap="$1">
          <Paragraph color="$brandSeamRed" fontWeight="800" fontSize="$5">
            VS
          </Paragraph>
          <Paragraph color="$colorPress" fontSize="$2">
            Week matchup
          </Paragraph>
        </YStack>

        <YStack alignItems="center" gap="$2">
          <Paragraph fontSize={32} lineHeight={36}>
            <Text role="img" aria-label="bear">
              {'🐻'}
            </Text>
          </Paragraph>
          <Paragraph fontWeight="700" color="$color" fontSize="$4">
            Opponent
          </Paragraph>
          <Paragraph
            fontWeight="800"
            fontSize={28}
            lineHeight={32}
            color="$colorPress"
          >
            72.0
          </Paragraph>
        </YStack>
      </XStack>

      <YStack
        borderTopWidth={1}
        borderTopColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
        padding="$3"
        gap="$2"
      >
        <Paragraph
          fontSize="$2"
          fontWeight="700"
          color="$brandGold"
          textTransform="uppercase"
          letterSpacing={1}
        >
          Top Performers This Week
        </Paragraph>
        {ONBOARDING_SAMPLE_TOP_PERFORMERS.map(({ name, stats, pts }) => (
          <XStack key={name} justifyContent="space-between" alignItems="center">
            <YStack>
              <Paragraph fontWeight="600" color="$color" fontSize="$3">
                {name}
              </Paragraph>
              <Paragraph color="$colorPress" fontSize="$2">
                {stats}
              </Paragraph>
            </YStack>
            <Paragraph fontWeight="700" color="$brandGoldLight" fontSize="$4">
              {pts} pts
            </Paragraph>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}
