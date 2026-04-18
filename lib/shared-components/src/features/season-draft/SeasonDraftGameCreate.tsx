import React, { useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Button, Card, H2, H3, Input, Text, XStack, YStack } from 'tamagui';
import { useCreateSeasonDraftGameMutation } from '../../api/db/graphql.generated';

/** Human-readable labels for stat keys */
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

const HITTER_STAT_KEYS = [
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
const PITCHER_STAT_KEYS = ['w', 'so', 'sv', 'sho', 'cg'];

interface SeasonDraftGameCreateProps {
  currentUserId: number;
  currentUserName: string;
  onCreated: (gameId: number) => void;
  onCancel?: () => void;
}

/**
 * Season Draft Game Create Form
 *
 * Lets the user configure and create a new season draft game.
 * The creator is added automatically; others join via the invite link
 * shown in the game lobby after creation.
 */
export const SeasonDraftGameCreate: React.FC<SeasonDraftGameCreateProps> = ({
  onCreated,
  onCancel,
}) => {
  const [gameName, setGameName] = useState('');
  const [playerType, setPlayerType] = useState<'hitter' | 'pitcher'>('hitter');
  const [gameMode, setGameMode] = useState<
    'season' | 'career_team' | 'most_teams'
  >('season');
  const [statKey, setStatKey] = useState('hr');
  const [submitting, setSubmitting] = useState(false);

  const [createGameMutation] = useCreateSeasonDraftGameMutation();

  useEffect(() => {
    setStatKey(playerType === 'pitcher' ? 'w' : 'hr');
  }, [playerType]);

  const statKeys =
    playerType === 'pitcher' ? PITCHER_STAT_KEYS : HITTER_STAT_KEYS;

  const handleCreate = async () => {
    if (!gameName.trim()) {
      Alert.alert('Error', 'Please enter a game name.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await createGameMutation({
        variables: {
          name: gameName.trim(),
          statKey,
          gameMode,
          playerType,
        },
      });

      const gameId = result.data?.createSeasonDraftGame;
      if (gameId) {
        onCreated(gameId);
      }
    } catch (error) {
      LOGGER.error('Failed to create game:', String(error));
      Alert.alert('Error', 'Failed to create game. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        padding="$4"
        backgroundColor="$blue10"
        justifyContent="space-between"
        alignItems="center"
      >
        {onCancel && (
          <Button size="$3" onPress={onCancel}>
            ← Back
          </Button>
        )}
        <H2 color="white" flex={1} textAlign="center">
          New Season Draft
        </H2>
        {onCancel && <YStack width={60} />}
      </XStack>

      <ScrollView>
        <YStack padding="$4" space="$4">
          {/* Game Name */}
          <Card padding="$4">
            <Text fontWeight="bold" marginBottom="$2">
              Game Name
            </Text>
            <Input
              placeholder="e.g., HR Challenge 2025"
              value={gameName}
              onChangeText={setGameName}
              size="$4"
            />
          </Card>

          {/* Player Type */}
          <Card padding="$4">
            <Text fontWeight="bold" marginBottom="$2">
              Draft Type
            </Text>
            <XStack space="$2">
              <Button
                flex={1}
                size="$4"
                variant={playerType === 'hitter' ? undefined : 'outlined'}
                theme={playerType === 'hitter' ? 'active' : undefined}
                onPress={() => setPlayerType('hitter')}
              >
                Hitter
              </Button>
              <Button
                flex={1}
                size="$4"
                variant={playerType === 'pitcher' ? undefined : 'outlined'}
                theme={playerType === 'pitcher' ? 'active' : undefined}
                onPress={() => setPlayerType('pitcher')}
              >
                Pitcher
              </Button>
            </XStack>
          </Card>

          {/* Game Mode */}
          <Card padding="$4">
            <Text fontWeight="bold" marginBottom="$2">
              Game Mode
            </Text>
            <XStack space="$2" flexWrap="wrap">
              <Button
                flex={1}
                size="$4"
                variant={gameMode === 'season' ? undefined : 'outlined'}
                theme={gameMode === 'season' ? 'active' : undefined}
                onPress={() => setGameMode('season')}
              >
                Season
              </Button>
              <Button
                flex={1}
                size="$4"
                variant={gameMode === 'career_team' ? undefined : 'outlined'}
                theme={gameMode === 'career_team' ? 'active' : undefined}
                onPress={() => setGameMode('career_team')}
              >
                Career w/ Team
              </Button>
              <Button
                flex={1}
                size="$4"
                variant={gameMode === 'most_teams' ? undefined : 'outlined'}
                theme={gameMode === 'most_teams' ? 'active' : undefined}
                onPress={() => setGameMode('most_teams')}
              >
                Most Teams
              </Button>
            </XStack>
            <Text fontSize="$2" color="$gray9" marginTop="$2">
              {gameMode === 'season'
                ? "Draft a player + specific year. Score is that player's stat in that season."
                : gameMode === 'career_team'
                  ? 'Draft a player + team. Score is their career total with that franchise.'
                  : 'Draft a player. Score is the number of distinct teams they played for.'}
            </Text>
          </Card>

          {/* Stat Key (hidden for most_teams — derived stat) */}
          {gameMode !== 'most_teams' && (
            <Card padding="$4">
              <Text fontWeight="bold" marginBottom="$2">
                Stat to Draft
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack space="$2" flexWrap="wrap">
                  {statKeys.map((key) => (
                    <Button
                      key={key}
                      size="$3"
                      variant={statKey === key ? undefined : 'outlined'}
                      theme={statKey === key ? 'active' : undefined}
                      onPress={() => setStatKey(key)}
                      marginBottom="$1"
                    >
                      {STAT_LABELS[key] ?? key}
                    </Button>
                  ))}
                </XStack>
              </ScrollView>
            </Card>
          )}

          {/* Invite info */}
          <Card padding="$4" backgroundColor="$blue2">
            <H3 marginBottom="$2">Invite Players</H3>
            <Text color="$gray11" fontSize="$3">
              After creating the game, you'll get an invite link to share with
              friends. They can join before you start the draft.
            </Text>
          </Card>

          {/* Create Button */}
          <Button
            size="$5"
            backgroundColor="$green10"
            color="white"
            onPress={() => void handleCreate()}
            disabled={!gameName.trim() || submitting}
          >
            {submitting ? (
              <XStack space="$2" alignItems="center">
                <ActivityIndicator size="small" color="white" />
                <Text color="white">Creating...</Text>
              </XStack>
            ) : (
              'Create Game'
            )}
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
};

export default SeasonDraftGameCreate;
