import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { SalaryCapField } from '@legacy-sports/shared-components/leagues';
import { PremiumGate } from '../../PremiumGate';

export type DefensiveFormat = 'dst' | 'idp';

interface StepDefensiveFormatProps {
  defensiveFormat: DefensiveFormat;
  onChange: (format: DefensiveFormat) => void;
  salaryCapEnabled: boolean;
  salaryCap?: number;
  onSalaryCapToggle: (enabled: boolean) => void;
  onSalaryCapAmountChange: (amount: number | undefined) => void;
  salaryCapError?: string;
  isPremium: boolean;
  premiumLoading: boolean;
  onUpgradeSalaryCap: () => void;
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
    slots: ['DL', 'LB', 'DB'],
  },
];

export function StepDefensiveFormat({
  defensiveFormat,
  onChange,
  salaryCapEnabled,
  salaryCap,
  onSalaryCapToggle,
  onSalaryCapAmountChange,
  salaryCapError,
  isPremium,
  premiumLoading,
  onUpgradeSalaryCap,
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
          Defensive Format
        </Text>
        <Text fontSize={14} color="$textMuted">
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

      {/* Salary cap is sport-agnostic server-side (LS-6143) — premium
          football leagues can enable it here same as baseball. */}
      <PremiumGate isPremium={isPremium} featureName="Salary Cap">
        <SalaryCapField
          enabled={salaryCapEnabled}
          amount={salaryCap}
          onToggleEnabled={onSalaryCapToggle}
          onAmountChange={onSalaryCapAmountChange}
          isPremium={isPremium && !premiumLoading}
          error={salaryCapError}
          onUpgrade={onUpgradeSalaryCap}
        />
      </PremiumGate>
    </YStack>
  );
}
