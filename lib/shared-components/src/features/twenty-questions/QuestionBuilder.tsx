import React, { useState } from 'react';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';
import { TwentyQuestionsCategory } from '@legacy-sports/graphql';

export interface AskPayload {
  category: TwentyQuestionsCategory;
  parameter: string;
}

interface QuestionBuilderProps {
  onAsk: (payload: AskPayload) => void;
  asking: boolean;
}

const CATEGORIES: { value: TwentyQuestionsCategory; label: string }[] = [
  { value: TwentyQuestionsCategory.Position, label: 'Position' },
  { value: TwentyQuestionsCategory.Team, label: 'Team' },
  { value: TwentyQuestionsCategory.Era, label: 'Era/Decade' },
  { value: TwentyQuestionsCategory.HallOfFame, label: 'Hall of Fame' },
  { value: TwentyQuestionsCategory.StatThreshold, label: 'Stat Threshold' },
  { value: TwentyQuestionsCategory.BattingHand, label: 'Batting Hand' },
  { value: TwentyQuestionsCategory.ThrowingHand, label: 'Throwing Hand' },
  { value: TwentyQuestionsCategory.ActiveStatus, label: 'Active/Retired' },
];

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'P', 'DH'];

const MLB_TEAMS = [
  'ARI',
  'ATL',
  'BAL',
  'BOS',
  'CHC',
  'CHW',
  'CIN',
  'CLE',
  'COL',
  'DET',
  'HOU',
  'KCR',
  'LAA',
  'LAD',
  'MIA',
  'MIL',
  'MIN',
  'NYM',
  'NYY',
  'OAK',
  'PHI',
  'PIT',
  'SDP',
  'SEA',
  'SFG',
  'STL',
  'TBR',
  'TEX',
  'TOR',
  'WSN',
  'FLA',
  'MON',
  'TBD',
  'CAL',
  'ANA',
  'MIL',
  'SEA',
];

const UNIQUE_TEAMS = [...new Set(MLB_TEAMS)];

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

const BATTING_STATS = [
  { value: 'hr', label: 'Home Runs (HR)' },
  { value: 'h', label: 'Hits (H)' },
  { value: 'rbi', label: 'RBI' },
  { value: 'sb', label: 'Stolen Bases (SB)' },
  { value: 'r', label: 'Runs (R)' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'bb', label: 'Walks (BB)' },
];

const PITCHING_STATS = [
  { value: 'w', label: 'Wins (W)' },
  { value: 'so', label: 'Strikeouts (K)' },
  { value: 'sv', label: 'Saves (SV)' },
  { value: 'sho', label: 'Shutouts (SHO)' },
];

export const QuestionBuilder: React.FC<QuestionBuilderProps> = ({
  onAsk,
  asking,
}) => {
  const [category, setCategory] = useState<TwentyQuestionsCategory | null>(
    null,
  );
  const [positions, setPositions] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [decades, setDecades] = useState<number[]>([]);
  const [statPlayerType, setStatPlayerType] = useState<'batter' | 'pitcher'>(
    'batter',
  );
  const [stat, setStat] = useState('hr');
  const [threshold, setThreshold] = useState('500');
  const [battingHands, setBattingHands] = useState<string[]>([]);
  const [throwingHands, setThrowingHands] = useState<string[]>([]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const buildParameter = (): string => {
    switch (category) {
      case TwentyQuestionsCategory.Position:
        return JSON.stringify({ positions });
      case TwentyQuestionsCategory.Team:
        return JSON.stringify({ teams });
      case TwentyQuestionsCategory.Era:
        return JSON.stringify({ decades });
      case TwentyQuestionsCategory.HallOfFame:
        return '{}';
      case TwentyQuestionsCategory.StatThreshold:
        return JSON.stringify({
          stat,
          threshold: parseInt(threshold, 10) || 0,
          playerType: statPlayerType,
        });
      case TwentyQuestionsCategory.BattingHand:
        return JSON.stringify({ hands: battingHands });
      case TwentyQuestionsCategory.ThrowingHand:
        return JSON.stringify({ hands: throwingHands });
      case TwentyQuestionsCategory.ActiveStatus:
        return '{}';
      default:
        return '{}';
    }
  };

  // Multi-select categories require at least one option selected before asking.
  const hasRequiredSelection = (): boolean => {
    switch (category) {
      case TwentyQuestionsCategory.Position:
        return positions.length > 0;
      case TwentyQuestionsCategory.Team:
        return teams.length > 0;
      case TwentyQuestionsCategory.Era:
        return decades.length > 0;
      case TwentyQuestionsCategory.BattingHand:
        return battingHands.length > 0;
      case TwentyQuestionsCategory.ThrowingHand:
        return throwingHands.length > 0;
      default:
        return true;
    }
  };

  const canSubmit = category !== null && !asking && hasRequiredSelection();

  const handleAsk = () => {
    if (!category) return;
    onAsk({ category, parameter: buildParameter() });
    // Reset selections and category after asking
    setPositions([]);
    setTeams([]);
    setDecades([]);
    setBattingHands([]);
    setThrowingHands([]);
    setCategory(null);
  };

  return (
    <YStack gap="$3" testID="question-builder">
      <Text fontSize="$3" fontWeight="600" color="$gray10">
        Ask a Question
      </Text>

      {/* Category tabs */}
      <XStack flexWrap="wrap" gap="$1">
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            size="$2"
            theme={category === c.value ? 'blue' : undefined}
            variant={category === c.value ? undefined : 'outlined'}
            onPress={() => setCategory(c.value)}
            testID={`category-${c.value}`}
          >
            {c.label}
          </Button>
        ))}
      </XStack>

      {/* Category-specific controls — multi-select for set-valued categories */}
      {category === TwentyQuestionsCategory.Position && (
        <YStack gap="$1" testID="position-picker">
          <Text fontSize="$2" color="$gray9">
            Select one or more positions:
          </Text>
          <XStack flexWrap="wrap" gap="$1">
            {POSITIONS.map((p) => {
              const selected = positions.includes(p);
              return (
                <Button
                  key={p}
                  size="$2"
                  theme={selected ? 'blue' : undefined}
                  variant={selected ? undefined : 'outlined'}
                  onPress={() => setPositions((cur) => toggle(cur, p))}
                  testID={`position-${p}`}
                >
                  {p}
                </Button>
              );
            })}
          </XStack>
        </YStack>
      )}

      {category === TwentyQuestionsCategory.Team && (
        <YStack gap="$1" testID="team-picker">
          <Text fontSize="$2" color="$gray9">
            Select one or more teams:
          </Text>
          <XStack flexWrap="wrap" gap="$1">
            {UNIQUE_TEAMS.map((t) => {
              const selected = teams.includes(t);
              return (
                <Button
                  key={t}
                  size="$2"
                  theme={selected ? 'blue' : undefined}
                  variant={selected ? undefined : 'outlined'}
                  onPress={() => setTeams((cur) => toggle(cur, t))}
                  testID={`team-${t}`}
                >
                  {t}
                </Button>
              );
            })}
          </XStack>
        </YStack>
      )}

      {category === TwentyQuestionsCategory.Era && (
        <YStack gap="$1" testID="decade-picker">
          <Text fontSize="$2" color="$gray9">
            Select one or more eras:
          </Text>
          <XStack flexWrap="wrap" gap="$1">
            {DECADES.map((d) => {
              const selected = decades.includes(d);
              return (
                <Button
                  key={d}
                  size="$2"
                  theme={selected ? 'blue' : undefined}
                  variant={selected ? undefined : 'outlined'}
                  onPress={() => setDecades((cur) => toggle(cur, d))}
                  testID={`decade-${d}`}
                >
                  {d}s
                </Button>
              );
            })}
          </XStack>
        </YStack>
      )}

      {category === TwentyQuestionsCategory.StatThreshold && (
        <YStack gap="$2" testID="stat-threshold-picker">
          <XStack gap="$2">
            {(['batter', 'pitcher'] as const).map((pt) => (
              <Button
                key={pt}
                size="$2"
                theme={statPlayerType === pt ? 'blue' : undefined}
                variant={statPlayerType === pt ? undefined : 'outlined'}
                onPress={() => {
                  setStatPlayerType(pt);
                  setStat(pt === 'batter' ? 'hr' : 'w');
                }}
                testID={`player-type-${pt}`}
              >
                {pt === 'batter' ? 'Batter' : 'Pitcher'}
              </Button>
            ))}
          </XStack>
          <XStack flexWrap="wrap" gap="$1">
            {(statPlayerType === 'batter' ? BATTING_STATS : PITCHING_STATS).map(
              (s) => (
                <Button
                  key={s.value}
                  size="$2"
                  theme={stat === s.value ? 'blue' : undefined}
                  variant={stat === s.value ? undefined : 'outlined'}
                  onPress={() => setStat(s.value)}
                  testID={`stat-${s.value}`}
                >
                  {s.label}
                </Button>
              ),
            )}
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Paragraph fontSize="$3" color="$gray10">
              Threshold:
            </Paragraph>
            <Input
              size="$3"
              width={100}
              keyboardType="numeric"
              value={threshold}
              onChangeText={setThreshold}
              placeholder="e.g. 500"
              testID="threshold-input"
            />
          </XStack>
        </YStack>
      )}

      {category === TwentyQuestionsCategory.BattingHand && (
        <XStack gap="$2" testID="batting-hand-picker">
          {(['L', 'R', 'S'] as const).map((h) => {
            const selected = battingHands.includes(h);
            return (
              <Button
                key={h}
                size="$3"
                theme={selected ? 'blue' : undefined}
                variant={selected ? undefined : 'outlined'}
                onPress={() => setBattingHands((cur) => toggle(cur, h))}
                testID={`batting-hand-${h}`}
              >
                {h === 'L' ? 'Left' : h === 'R' ? 'Right' : 'Switch'}
              </Button>
            );
          })}
        </XStack>
      )}

      {category === TwentyQuestionsCategory.ThrowingHand && (
        <XStack gap="$2" testID="throwing-hand-picker">
          {(['L', 'R'] as const).map((h) => {
            const selected = throwingHands.includes(h);
            return (
              <Button
                key={h}
                size="$3"
                theme={selected ? 'blue' : undefined}
                variant={selected ? undefined : 'outlined'}
                onPress={() => setThrowingHands((cur) => toggle(cur, h))}
                testID={`throwing-hand-${h}`}
              >
                {h === 'L' ? 'Left' : 'Right'}
              </Button>
            );
          })}
        </XStack>
      )}

      {(category === TwentyQuestionsCategory.HallOfFame ||
        category === TwentyQuestionsCategory.ActiveStatus) && (
        <Paragraph fontSize="$3" color="$gray10" testID="no-param-hint">
          {category === TwentyQuestionsCategory.HallOfFame
            ? 'Asks: "Is this player in the Hall of Fame?"'
            : 'Asks: "Is this player currently active (2023+)?"'}
        </Paragraph>
      )}

      <Button
        size="$4"
        backgroundColor="$brandNavyLight"
        onPress={handleAsk}
        disabled={!canSubmit}
        testID="ask-question-button"
      >
        {asking ? 'Asking…' : 'Ask Question'}
      </Button>
    </YStack>
  );
};
