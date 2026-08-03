import React from 'react';
import { Input, Label, Text, XStack, YStack } from 'tamagui';
import type { SportChoice } from './StepSportSelect';

export interface LeagueSettings {
  name: string;
  numTeams: number;
  draftType: 'snake' | 'auction';
  auctionBudget: number;
  auctionMinBid: number;
}

interface StepLeagueSettingsProps {
  sport: SportChoice;
  settings: LeagueSettings;
  onChange: (settings: LeagueSettings) => void;
}

const TEAM_COUNT_OPTIONS = [4, 6, 8, 10, 12, 14, 16, 18, 20];

// Same bounds/defaults as the rich league-create form
// (apps/web/src/pages/baseball/LeagueCreatePage.tsx), independent of sport.
// Not shared with CreateLeagueWizard.tsx via export: that module is fully
// jest.mock()'d in CreateLeagueWizard.component.spec.tsx, which would also
// blank out any named constant exports re-imported from here.
const AUCTION_BUDGET_RANGE = { min: 1, max: 10_000 };
const AUCTION_MIN_BID_RANGE = { min: 1, max: 10_000 };
const DEFAULT_AUCTION_BUDGET = 200;
const DEFAULT_AUCTION_MIN_BID = 1;

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
                    settings.draftType === opt.value
                      ? '$textOnAccent'
                      : '$color'
                  }
                >
                  {opt.label}
                </Text>
                <Text
                  fontSize={11}
                  color={
                    settings.draftType === opt.value
                      ? '$textOnAccent'
                      : '$textMuted'
                  }
                  opacity={settings.draftType === opt.value ? 0.85 : 1}
                  textAlign="center"
                >
                  {opt.description}
                </Text>
              </YStack>
            </OptionButton>
          ))}
        </XStack>
      </YStack>

      {settings.draftType === 'auction' && (
        <XStack gap="$4" flexWrap="wrap">
          <YStack gap="$2" flex={1} minWidth={140}>
            <Label htmlFor="auction-budget" color="$color" fontWeight="600">
              Auction Budget per Team
            </Label>
            <Input
              id="auction-budget"
              value={String(settings.auctionBudget)}
              onChangeText={(text: string) => {
                const n = parseInt(text, 10);
                if (Number.isNaN(n)) return;
                set(
                  'auctionBudget',
                  Math.min(
                    Math.max(n, AUCTION_BUDGET_RANGE.min),
                    AUCTION_BUDGET_RANGE.max,
                  ),
                );
              }}
              placeholder={String(DEFAULT_AUCTION_BUDGET)}
              keyboardType="numeric"
              backgroundColor="$surfaceCard"
              borderColor="$surfacePanelBorder"
              color="$color"
            />
            <Text fontSize={12} color="$textMuted">
              {AUCTION_BUDGET_RANGE.min}–{AUCTION_BUDGET_RANGE.max}
            </Text>
          </YStack>
          <YStack gap="$2" flex={1} minWidth={140}>
            <Label htmlFor="auction-min-bid" color="$color" fontWeight="600">
              Minimum Bid
            </Label>
            <Input
              id="auction-min-bid"
              value={String(settings.auctionMinBid)}
              onChangeText={(text: string) => {
                const n = parseInt(text, 10);
                if (Number.isNaN(n)) return;
                set(
                  'auctionMinBid',
                  Math.min(
                    Math.max(n, AUCTION_MIN_BID_RANGE.min),
                    AUCTION_MIN_BID_RANGE.max,
                  ),
                );
              }}
              placeholder={String(DEFAULT_AUCTION_MIN_BID)}
              keyboardType="numeric"
              backgroundColor="$surfaceCard"
              borderColor="$surfacePanelBorder"
              color="$color"
            />
            <Text fontSize={12} color="$textMuted">
              {AUCTION_MIN_BID_RANGE.min}–{AUCTION_MIN_BID_RANGE.max}
            </Text>
          </YStack>
        </XStack>
      )}
    </YStack>
  );
}
