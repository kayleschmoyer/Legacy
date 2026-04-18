import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import { useCreateSeasonDraftGameMutation } from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
} from '../../constants/colors';

const STAT_LABELS: Record<string, string> = {
  hr: 'Home Runs',
  h: 'Hits',
  rbi: 'RBI',
  sb: 'Stolen Bases',
  r: 'Runs',
  doubles: 'Doubles',
  triples: 'Triples',
  bb: 'Walks',
  tb: 'Total Bases',
  w: 'Wins',
  so: 'Strikeouts',
  sv: 'Saves',
  sho: 'Shutouts',
  cg: 'Complete Games',
};

const HITTER_STATS = [
  'hr',
  'h',
  'rbi',
  'sb',
  'r',
  'doubles',
  'triples',
  'bb',
  'tb',
];
const PITCHER_STATS = ['w', 'so', 'sv', 'sho', 'cg'];

function SelectButton({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="$3"
      onPress={onPress}
      disabled={disabled}
      backgroundColor={selected ? BRAND_NAVY_LIGHT : '$color2'}
      borderColor={selected ? BRAND_NAVY_LIGHT : '$borderColor'}
      borderWidth={selected ? 2 : 1}
      hoverStyle={{
        backgroundColor: selected ? BRAND_NAVY : '$color3',
        borderColor: selected ? BRAND_NAVY : '$borderColorHover',
      }}
      pressStyle={{
        scale: 0.95,
        backgroundColor: selected ? BRAND_NAVY_DARK : '$color4',
      }}
    >
      <Text
        color={selected ? BRAND_GOLD : '$color'}
        fontWeight={selected ? '600' : '400'}
      >
        {label}
      </Text>
    </Button>
  );
}

export const SeasonDraftGameCreatePage: React.FC = () => {
  const navigate = useNavigate();

  const [gameName, setGameName] = useState('');
  const [playerType, setPlayerType] = useState<'hitter' | 'pitcher'>('hitter');
  const [gameMode, setGameMode] = useState<'season' | 'career_team'>('season');
  const [statKey, setStatKey] = useState('hr');
  const [formError, setFormError] = useState<string | null>(null);

  const [createGame, { loading }] = useCreateSeasonDraftGameMutation();

  useEffect(() => {
    setStatKey(playerType === 'pitcher' ? 'w' : 'hr');
  }, [playerType]);

  const statKeys = playerType === 'pitcher' ? PITCHER_STATS : HITTER_STATS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!gameName.trim()) {
      setFormError('Please enter a game name.');
      return;
    }

    try {
      const result = await createGame({
        variables: {
          name: gameName.trim(),
          statKey,
          gameMode,
          playerType,
        },
      });
      const gameId = result.data?.createSeasonDraftGame;
      if (gameId) {
        navigate(`/games/season-draft/${gameId}`);
      } else {
        setFormError('Failed to create game. Please try again.');
        LOGGER.error(
          'createSeasonDraftGame returned no game ID',
          new Error('Missing game ID'),
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to create season draft game', err);
      setFormError('Failed to create game. Please try again.');
    }
  };

  return (
    <YStack
      padding="$6"
      $sm={{ padding: '$3', paddingBottom: '$6' }}
      space="$6"
      maxWidth={600}
      alignSelf="center"
      width="100%"
    >
      <PageMeta
        title="Create Season Draft Game"
        description="Create a new Season Draft Game and invite friends to compete."
      />

      <YStack alignItems="center" space="$3">
        <H1 size="$8" color="$color" textAlign="center">
          <span role="img" aria-label="trophy">
            🏆
          </span>{' '}
          New Season Draft Game
        </H1>
        <Text size="$4" color="$gray11" textAlign="center">
          Create the game, then share an invite link for others to join
        </Text>
      </YStack>

      <Card
        elevate
        size="$4"
        bordered
        backgroundColor="$color2"
        borderColor="$borderColor"
      >
        <Card.Header padded>
          <H2 size="$6" color="$color">
            Game Settings
          </H2>
        </Card.Header>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <YStack padding="$4" space="$5">
            {/* Game Name */}
            <YStack space="$2">
              <Text
                size="$4"
                fontWeight="600"
                color="$gray12"
                nativeID="label-game-name"
              >
                Game Name *
              </Text>
              <Input
                size="$4"
                placeholder="e.g., HR Challenge 2025"
                value={gameName}
                onChangeText={setGameName}
                borderColor="$borderColor"
                backgroundColor="$color1"
                disabled={loading}
                aria-labelledby="label-game-name"
                aria-required="true"
              />
            </YStack>

            <Separator />

            {/* Draft Type */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Draft Type
              </Text>
              <XStack space="$2">
                <SelectButton
                  label="Hitters"
                  selected={playerType === 'hitter'}
                  onPress={() => setPlayerType('hitter')}
                  disabled={loading}
                />
                <SelectButton
                  label="Pitchers"
                  selected={playerType === 'pitcher'}
                  onPress={() => setPlayerType('pitcher')}
                  disabled={loading}
                />
              </XStack>
            </YStack>

            {/* Game Mode */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Game Mode
              </Text>
              <XStack space="$2">
                <SelectButton
                  label="Season"
                  selected={gameMode === 'season'}
                  onPress={() => setGameMode('season')}
                  disabled={loading}
                />
                <SelectButton
                  label="Career w/ Team"
                  selected={gameMode === 'career_team'}
                  onPress={() => setGameMode('career_team')}
                  disabled={loading}
                />
              </XStack>
              <Text size="$2" color="$gray10">
                {gameMode === 'season'
                  ? "Draft a player + specific year. Score is that player's stat in that season."
                  : 'Draft a player + team. Score is their career total with that franchise.'}
              </Text>
            </YStack>

            {/* Stat to Draft */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Stat to Draft
              </Text>
              <XStack space="$2" flexWrap="wrap">
                {statKeys.map((key) => (
                  <SelectButton
                    key={key}
                    label={STAT_LABELS[key] ?? key}
                    selected={statKey === key}
                    onPress={() => setStatKey(key)}
                    disabled={loading}
                  />
                ))}
              </XStack>
            </YStack>

            {/* Error */}
            {formError && (
              <Text color="$red10" size="$3">
                {formError}
              </Text>
            )}

            {/* Actions */}
            <XStack space="$3" justifyContent="flex-end" marginTop="$2">
              <Button
                size="$4"
                variant="outlined"
                onPress={() => navigate('/games/season-draft')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                size="$4"
                backgroundColor={BRAND_NAVY_LIGHT}
                color={BRAND_GOLD}
                borderColor={BRAND_NAVY_LIGHT}
                hoverStyle={{
                  backgroundColor: BRAND_NAVY,
                  borderColor: BRAND_NAVY,
                }}
                pressStyle={{
                  scale: 0.97,
                  backgroundColor: BRAND_NAVY_DARK,
                }}
                disabled={!gameName.trim() || loading}
                tag="button"
                type="submit"
              >
                {loading ? 'Creating...' : 'Create Game'}
              </Button>
            </XStack>
          </YStack>
        </form>
      </Card>
    </YStack>
  );
};

export default SeasonDraftGameCreatePage;
