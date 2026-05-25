import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../constants/colors';

export type SportChoice = 'BASEBALL' | 'FOOTBALL';

interface StepSportSelectProps {
  sport: SportChoice;
  onChange: (sport: SportChoice) => void;
}

const SPORT_OPTIONS: Array<{
  id: SportChoice;
  icon: string;
  name: string;
  description: string;
}> = [
  {
    id: 'BASEBALL',
    icon: '⚾',
    name: 'Baseball',
    description:
      'Classic fantasy baseball with batting, pitching, and fielding stats',
  },
  {
    id: 'FOOTBALL',
    icon: '🏈',
    name: 'Football',
    description:
      'Fantasy football with passing, rushing, receiving, kicking, and defensive stats',
  },
];

export function StepSportSelect({ sport, onChange }: StepSportSelectProps) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color={TEXT_PRIMARY}
        >
          Choose Your Sport
        </Text>
        <Text fontSize={14} color={TEXT_MUTED}>
          Select the sport for your fantasy league.
        </Text>
      </YStack>
      <XStack gap="$3" flexWrap="wrap">
        {SPORT_OPTIONS.map((option) => {
          const isSelected = sport === option.id;
          return (
            <Card
              key={option.id}
              pressStyle={{ scale: 0.98 }}
              onPress={() => onChange(option.id)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(option.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              flex={1}
              minWidth={140}
              padding="$4"
              backgroundColor={
                isSelected ? withAlpha(BRAND_NAVY, 0.5) : SURFACE_CARD
              }
              borderWidth={2}
              borderColor={isSelected ? BRAND_GOLD : PANEL_BORDER}
              borderRadius="$3"
              cursor="pointer"
              animation="quick"
            >
              <YStack gap="$2" alignItems="center">
                <Text fontSize={40}>{option.icon}</Text>
                <Text
                  fontSize={16}
                  fontWeight="700"
                  fontFamily="$heading"
                  color={isSelected ? BRAND_GOLD : TEXT_PRIMARY}
                  textAlign="center"
                >
                  {option.name}
                </Text>
                <Text fontSize={12} color={TEXT_MUTED} textAlign="center">
                  {option.description}
                </Text>
              </YStack>
            </Card>
          );
        })}
      </XStack>
    </YStack>
  );
}
