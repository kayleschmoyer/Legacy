import React from 'react';
import { Input, Label, Text, XStack, YStack } from 'tamagui';
import type { SportChoice } from './StepSportSelect';
import {
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../../constants/colors';

export interface LeagueSettings {
  name: string;
  numTeams: number;
  draftType: 'snake' | 'auction';
}

interface StepLeagueSettingsProps {
  sport: SportChoice;
  settings: LeagueSettings;
  onChange: (settings: LeagueSettings) => void;
}

const TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16, 18, 20];

const DRAFT_TYPE_OPTIONS: Array<{
  value: 'snake' | 'auction';
  label: string;
  description: string;
}> = [
  {
    value: 'snake',
    label: 'Snake Draft',
    description: 'Teams alternate picks in a snake order',
  },
  {
    value: 'auction',
    label: 'Auction Draft',
    description: 'Teams bid on players with a budget',
  },
];

const OptionButton = ({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) => (
  <XStack
    pressStyle={{ opacity: 0.8 }}
    onPress={onPress}
    padding="$3"
    flex={1}
    backgroundColor={selected ? '$blue9' : SURFACE_CARD}
    borderWidth={1}
    borderColor={selected ? '$blue9' : PANEL_BORDER}
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
          color={TEXT_PRIMARY}
        >
          League Settings
        </Text>
        <Text fontSize={14} color={TEXT_MUTED}>
          Configure the basics of your{' '}
          {sport === 'FOOTBALL' ? 'football' : 'baseball'} league.
        </Text>
      </YStack>

      <YStack gap="$2">
        <Label htmlFor="league-name" color={TEXT_PRIMARY} fontWeight="600">
          League Name
        </Label>
        <Input
          id="league-name"
          value={settings.name}
          onChangeText={(v: string) => set('name', v)}
          placeholder="Enter league name"
          maxLength={50}
          backgroundColor={SURFACE_CARD}
          borderColor={PANEL_BORDER}
          color={TEXT_PRIMARY}
          placeholderTextColor={TEXT_MUTED}
        />
      </YStack>

      <YStack gap="$2">
        <Text color={TEXT_PRIMARY} fontWeight="600" fontSize={14}>
          Number of Teams
        </Text>
        <Text fontSize={12} color={TEXT_MUTED}>
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
                settings.numTeams === n ? '$blue9' : SURFACE_CARD
              }
              borderWidth={1}
              borderColor={settings.numTeams === n ? '$blue9' : PANEL_BORDER}
              borderRadius="$2"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              animation="quick"
            >
              <Text
                color={settings.numTeams === n ? '$color1' : TEXT_PRIMARY}
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
        <Text color={TEXT_PRIMARY} fontWeight="600" fontSize={14}>
          Draft Type
        </Text>
        <XStack gap="$2">
          {DRAFT_TYPE_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              selected={settings.draftType === opt.value}
              onPress={() => set('draftType', opt.value)}
            >
              <YStack alignItems="center" gap="$1">
                <Text
                  fontSize={13}
                  fontWeight="700"
                  color={
                    settings.draftType === opt.value ? '$color1' : TEXT_PRIMARY
                  }
                >
                  {opt.label}
                </Text>
                <Text
                  fontSize={11}
                  color={
                    settings.draftType === opt.value ? '$color2' : TEXT_MUTED
                  }
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
