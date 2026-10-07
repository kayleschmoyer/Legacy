import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { FOOTBALL_DST_DATA_AVAILABLE } from '@legacy-sports/utils';

export type DefensiveFormat = 'dst' | 'idp';
export type ScoringFormat = 'standard' | 'half_ppr' | 'ppr';

interface StepDefensiveFormatProps {
  defensiveFormat: DefensiveFormat;
  onChange: (format: DefensiveFormat) => void;
  scoringFormat: ScoringFormat;
  onScoringFormatChange: (format: ScoringFormat) => void;
}

// Mirrors SCORING_FORMAT_OPTIONS in
// lib/shared-components/src/features/leagues/create-wizard/constants.ts and
// apps/web/src/pages/baseball/LeagueCreatePage.tsx — only the reception
// bonus differs across formats (LS-4158).
const SCORING_FORMAT_OPTIONS: Array<{
  id: ScoringFormat;
  label: string;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'No bonus points for receptions.',
  },
  {
    id: 'half_ppr',
    label: 'Half-PPR',
    description: '0.5 points per reception.',
  },
  {
    id: 'ppr',
    label: 'PPR',
    description: '1 point per reception.',
  },
];

const ALL_FORMAT_OPTIONS: Array<{
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
    slots: ['DL', 'LB', 'DB'],
  },
];

// Team D/ST is hidden while no team-defense players exist (LS-10727): its
// required DST slot could never be filled, and the server rejects it.
const FORMAT_OPTIONS = ALL_FORMAT_OPTIONS.filter(
  (option) => option.id !== 'dst' || FOOTBALL_DST_DATA_AVAILABLE,
);

export function StepDefensiveFormat({
  defensiveFormat,
  onChange,
  scoringFormat,
  onScoringFormatChange,
}: StepDefensiveFormatProps) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          Scoring Format
        </Text>
        <Text fontSize={14} color="$textMuted">
          Sets the reception bonus. All other stats are identical across
          formats.
        </Text>
      </YStack>

      <XStack gap="$2" flexWrap="wrap">
        {SCORING_FORMAT_OPTIONS.map((option) => {
          const isSelected = scoringFormat === option.id;
          return (
            <XStack
              key={option.id}
              testID={`scoring-format-${option.id}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              tabIndex={0}
              onPress={() => onScoringFormatChange(option.id)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onScoringFormatChange(option.id);
                }
              }}
              pressStyle={{ opacity: 0.8 }}
              padding="$3"
              flex={1}
              minWidth={100}
              gap="$1"
              backgroundColor={isSelected ? '$brandNavyLight' : '$surfaceCard'}
              borderWidth={isSelected ? 2 : 1}
              borderColor={
                isSelected ? '$brandNavyLight' : '$surfacePanelBorder'
              }
              borderRadius="$2"
              cursor="pointer"
              animation="quick"
              alignItems="center"
              justifyContent="center"
            >
              <Text
                fontSize={14}
                fontWeight="700"
                color={isSelected ? '$textOnAccent' : '$color'}
              >
                {option.label}
              </Text>
              <Text
                fontSize={11}
                color={isSelected ? '$textOnAccent' : '$textMuted'}
                textAlign="center"
              >
                {option.description}
              </Text>
            </XStack>
          );
        })}
      </XStack>

      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          Defensive Format
        </Text>
        <Text fontSize={14} color="$textMuted">
          Choose how your league handles defensive players. Changing this will
          update your roster slot defaults.
        </Text>
        {!FOOTBALL_DST_DATA_AVAILABLE && (
          <Text
            testID="defensive-format-dst-unavailable"
            fontSize={13}
            color="$textMuted"
          >
            Team D/ST leagues are coming soon — team defense data is still being
            loaded.
          </Text>
        )}
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
                isSelected ? '$surfaceInteractive' : '$surfaceCard'
              }
              borderWidth={2}
              borderColor={isSelected ? '$brandGold' : '$surfacePanelBorder'}
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
                    borderColor={
                      isSelected ? '$brandGold' : '$surfacePanelBorder'
                    }
                    backgroundColor={isSelected ? '$brandGold' : 'transparent'}
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
                    color={isSelected ? '$brandGold' : '$color'}
                    flex={1}
                  >
                    {option.label}
                  </Text>
                  <Text
                    fontSize={11}
                    color="$textMuted"
                    backgroundColor="$surfacePanelBorder"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$1"
                  >
                    {option.subtitle}
                  </Text>
                </XStack>
                <Text fontSize={13} color="$textMuted" paddingLeft={26}>
                  {option.description}
                </Text>
                <XStack gap="$1" paddingLeft={26} flexWrap="wrap">
                  {option.slots.map((slot) => (
                    <Text
                      key={slot}
                      fontSize={11}
                      fontWeight="600"
                      color={isSelected ? '$brandGold' : '$textMuted'}
                      backgroundColor={
                        isSelected
                          ? 'color-mix(in srgb, var(--brandGold) 10%, transparent)'
                          : '$surfacePanelBorder'
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
