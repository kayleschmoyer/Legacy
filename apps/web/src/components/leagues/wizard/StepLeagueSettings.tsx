import React from 'react';
import { Input, Label, Text, XStack, YStack } from 'tamagui';
import type { SportChoice } from './StepSportSelect';

export interface LeagueSettings {
  name: string;
  numTeams: number;
  draftOrder: 'snake' | 'linear';
}

interface StepLeagueSettingsProps {
  sport: SportChoice;
  settings: LeagueSettings;
  onChange: (settings: LeagueSettings) => void;
}

const TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16, 18, 20];

// Auction is a premium selection method configured on the Premium Options
// step, not a draft order — see StepPremiumOptions (LS-6139).
const DRAFT_ORDER_OPTIONS: Array<{
  value: 'snake' | 'linear';
  label: string;
  description: string;
}> = [
  {
    value: 'snake',
    label: 'Snake Order',
    description: 'Pick order reverses each round',
  },
  {
    value: 'linear',
    label: 'Linear Order',
    description: 'Same pick order every round',
  },
];

const OptionButton = ({
  selected,
  label,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) => (
  <XStack
    accessibilityRole="button"
    accessibilityLabel={label}
    role="button"
    aria-label={label}
    tabIndex={0}
    onPress={onPress}
    onKeyDown={(e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    }}
    pressStyle={{ opacity: 0.8 }}
    padding="$3"
    flex={1}
    backgroundColor={selected ? '$brandNavyLight' : '$surfaceCard'}
    borderWidth={1}
    borderColor={selected ? '$brandNavyLight' : '$surfacePanelBorder'}
    borderRadius="$2"
    cursor="pointer"
    animation="quick"
    alignItems="center"
    justifyContent="center"
  >
    {children}
  </XStack>
);

export function StepLeagueSettings({
  sport,
  settings,
  onChange,
}: StepLeagueSettingsProps) {
  const defaultTeams = sport === 'FOOTBALL' ? 12 : 10;

  function set<K extends keyof LeagueSettings>(
    key: K,
    value: LeagueSettings[K],
  ) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <YStack gap="$5">
      <YStack gap="$1">
        <Text
          fontSize={22}
          fontWeight="700"
          fontFamily="$heading"
          color="$color"
        >
          League Settings
        </Text>
        <Text fontSize={14} color="$textMuted">
          Configure the basics of your{' '}
          {sport === 'FOOTBALL' ? 'football' : 'baseball'} league.
        </Text>
      </YStack>

      <YStack gap="$2">
        <Label htmlFor="league-name" color="$color" fontWeight="600">
          League Name
        </Label>
        <Input
          id="league-name"
          value={settings.name}
          onChangeText={(v: string) => set('name', v)}
          placeholder="Enter league name"
          maxLength={50}
          backgroundColor="$surfaceCard"
          borderColor="$surfacePanelBorder"
          color="$color"
          placeholderTextColor="$textMuted"
        />
      </YStack>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize={14}>
          Number of Teams
        </Text>
        <Text fontSize={12} color="$textMuted">
          Default: {defaultTeams} teams
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          {TEAM_COUNT_OPTIONS.map((n) => (
            <XStack
              key={n}
              pressStyle={{ opacity: 0.8 }}
              onPress={() => set('numTeams', n)}
              width={48}
              height={40}
              backgroundColor={
                settings.numTeams === n ? '$brandNavyLight' : '$surfaceCard'
              }
              borderWidth={1}
              borderColor={
                settings.numTeams === n
                  ? '$brandNavyLight'
                  : '$surfacePanelBorder'
              }
              borderRadius="$2"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              animation="quick"
            >
              <Text
                color={settings.numTeams === n ? '$textOnAccent' : '$color'}
                fontWeight="600"
                fontSize={13}
              >
                {n}
              </Text>
            </XStack>
          ))}
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text color="$color" fontWeight="600" fontSize={14}>
          Draft Order
        </Text>
        <XStack gap="$2">
          {DRAFT_ORDER_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              selected={settings.draftOrder === opt.value}
              label={opt.label}
              onPress={() => set('draftOrder', opt.value)}
            >
              <YStack alignItems="center" gap="$1">
                <Text
                  fontSize={13}
                  fontWeight="700"
                  color={
                    settings.draftOrder === opt.value
                      ? '$textOnAccent'
                      : '$color'
                  }
                >
                  {opt.label}
                </Text>
                <Text
                  fontSize={11}
                  color={
                    settings.draftOrder === opt.value
                      ? '$textOnAccent'
                      : '$textMuted'
                  }
                  opacity={settings.draftOrder === opt.value ? 0.85 : 1}
                  textAlign="center"
                >
                  {opt.description}
                </Text>
              </YStack>
            </OptionButton>
          ))}
        </XStack>
      </YStack>
    </YStack>
  );
}
