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

export type DefensiveFormat = 'dst' | 'idp';

interface StepDefensiveFormatProps {
  defensiveFormat: DefensiveFormat;
  onChange: (format: DefensiveFormat) => void;
}

const FORMAT_OPTIONS: Array<{
  id: DefensiveFormat;
  label: string;
  subtitle: string;
  description: string;
  slots: string[];
}> = [
  {
    id: 'dst',
    label: 'Team D/ST',
    subtitle: 'Default',
    description:
      'Draft one team defense per team. Scores on sacks, INTs, and points allowed.',
    slots: ['DST'],
  },
  {
    id: 'idp',
    label: 'Individual Defensive Players (IDP)',
    subtitle: 'Advanced',
    description:
      'Draft DL, LB, and DB individual players. Scores on tackles, sacks, and INTs per player.',
    slots: ['DL', 'LB', 'DB', 'DP'],
  },
];

export function StepDefensiveFormat({
  defensiveFormat,
  onChange,
}: StepDefensiveFormatProps) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color={TEXT_PRIMARY}
        >
          Defensive Format
        </Text>
        <Text fontSize={14} color={TEXT_MUTED}>
          Choose how your league handles defensive players. Changing this will
          update your roster slot defaults.
        </Text>
      </YStack>

      <YStack gap="$3">
        {FORMAT_OPTIONS.map((option) => {
          const isSelected = defensiveFormat === option.id;
          return (
            <Card
              key={option.id}
              pressStyle={{ scale: 0.99 }}
              onPress={() => onChange(option.id)}
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
              <YStack gap="$2">
                <XStack alignItems="center" gap="$2">
                  <XStack
                    width={18}
                    height={18}
                    borderRadius="$full"
                    borderWidth={2}
                    borderColor={isSelected ? BRAND_GOLD : PANEL_BORDER}
                    backgroundColor={isSelected ? BRAND_GOLD : 'transparent'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {isSelected && (
                      <XStack
                        width={8}
                        height={8}
                        borderRadius="$full"
                        backgroundColor="$color1"
                      />
                    )}
                  </XStack>
                  <Text
                    fontSize={15}
                    fontWeight="700"
                    color={isSelected ? BRAND_GOLD : TEXT_PRIMARY}
                    flex={1}
                  >
                    {option.label}
                  </Text>
                  <Text
                    fontSize={11}
                    color={TEXT_MUTED}
                    backgroundColor={PANEL_BORDER}
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$1"
                  >
                    {option.subtitle}
                  </Text>
                </XStack>
                <Text fontSize={13} color={TEXT_MUTED} paddingLeft={26}>
                  {option.description}
                </Text>
                <XStack gap="$1" paddingLeft={26} flexWrap="wrap">
                  {option.slots.map((slot) => (
                    <Text
                      key={slot}
                      fontSize={11}
                      fontWeight="600"
                      color={isSelected ? BRAND_GOLD : TEXT_MUTED}
                      backgroundColor={
                        isSelected ? withAlpha(BRAND_GOLD, 0.1) : PANEL_BORDER
                      }
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$1"
                    >
                      {slot}
                    </Text>
                  ))}
                </XStack>
              </YStack>
            </Card>
          );
        })}
      </YStack>
    </YStack>
  );
}
