import React, { useCallback, useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Button, Card, H2, H3, Input, Text, XStack, YStack } from 'tamagui';
import {
  useCreateSeasonDraftGameMutation,
  useSearchUsersForDraftLazyQuery,
} from '../../api/db/graphql.generated';

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

interface UserResult {
  id: number;
  username: string;
  avatarUrl?: string | null;
}

interface SelectedPlayer {
  userId: number;
  name: string;
}

interface SeasonDraftGameCreateProps {
  currentUserId: number;
  currentUserName: string;
  onCreated: (gameId: number) => void;
  onCancel?: () => void;
}

/**
 * Season Draft Game Create Form
 *
 * Lets the user configure and create a new season draft game:
 * - Game name
 * - Player type (hitter / pitcher)
 * - Game mode (season / career_team)
 * - Stat key selection
 * - Invite players by username search
 */
export const SeasonDraftGameCreate: React.FC<SeasonDraftGameCreateProps> = ({
  currentUserId,
  currentUserName,
  onCreated,
  onCancel,
}) => {
  const [gameName, setGameName] = useState('');
  const [playerType, setPlayerType] = useState<'hitter' | 'pitcher'>('hitter');
  const [gameMode, setGameMode] = useState<'season' | 'career_team'>('season');
  const [statKey, setStatKey] = useState('hr');
  const [userSearch, setUserSearch] = useState('');
  const [players, setPlayers] = useState<SelectedPlayer[]>([
    { userId: currentUserId, name: currentUserName },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const [createGameMutation] = useCreateSeasonDraftGameMutation();
  const [searchUsersQuery, { data: userSearchData }] =
    useSearchUsersForDraftLazyQuery();
  const userResults = (userSearchData?.searchUsers ?? []) as UserResult[];

  // When playerType changes, reset statKey to the first valid option
  useEffect(() => {
    setStatKey(playerType === 'pitcher' ? 'w' : 'hr');
  }, [playerType]);

  const statKeys =
    playerType === 'pitcher' ? PITCHER_STAT_KEYS : HITTER_STAT_KEYS;

  // Search users
  const searchUsers = useCallback(
    (term: string) => {
      if (term.length < 2) return;
      void searchUsersQuery({ variables: { searchTerm: term, limit: 10 } });
    },
    [searchUsersQuery],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (userSearch) {
        searchUsers(userSearch);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch, searchUsers]);

  const addPlayer = (user: UserResult) => {
    if (players.some((p) => p.userId === user.id)) {
      Alert.alert('Already Added', 'This player is already in the game.');
      return;
    }
    if (players.length >= 6) {
      Alert.alert('Max Players', 'Maximum 6 players per game.');
      return;
    }
    setPlayers((prev) => [...prev, { userId: user.id, name: user.username }]);
    setUserSearch('');
  };

  const removePlayer = (userId: number) => {
    if (userId === currentUserId) return; // Can't remove yourself
    setPlayers((prev) => prev.filter((p) => p.userId !== userId));
  };

  const handleCreate = async () => {
    if (!gameName.trim()) {
      Alert.alert('Error', 'Please enter a game name.');
      return;
    }
    if (players.length < 2) {
      Alert.alert('Error', 'You need at least 2 players to create a game.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await createGameMutation({
        variables: {
          name: gameName.trim(),
          playerNames: players.map((p) => p.name),
          userIds: players.map((p) => p.userId),
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
            <XStack space="$2">
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
            </XStack>
            <Text fontSize="$2" color="$gray9" marginTop="$2">
              {gameMode === 'season'
                ? "Draft a player + specific year. Score is that player's stat in that season."
                : 'Draft a player + team. Score is their career total with that franchise.'}
            </Text>
          </Card>

          {/* Stat Key */}
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

          {/* Players */}
          <Card padding="$4">
            <H3 marginBottom="$2">Players ({players.length}/6)</H3>

            {/* Current players list */}
            {players.map((player) => (
              <XStack
                key={player.userId}
                justifyContent="space-between"
                alignItems="center"
                padding="$2"
                marginBottom="$1"
                backgroundColor="$gray2"
                borderRadius="$2"
              >
                <Text fontWeight="600">
                  {player.name}
                  {player.userId === currentUserId ? ' (you)' : ''}
                </Text>
                {player.userId !== currentUserId && (
                  <Button
                    size="$2"
                    backgroundColor="$red10"
                    color="white"
                    onPress={() => removePlayer(player.userId)}
                  >
                    Remove
                  </Button>
                )}
              </XStack>
            ))}

            {/* User search to add players */}
            {players.length < 6 && (
              <YStack marginTop="$3">
                <Text marginBottom="$1" color="$gray10">
                  Add a player:
                </Text>
                <Input
                  placeholder="Search by username..."
                  value={userSearch}
                  onChangeText={setUserSearch}
                  size="$4"
                />
                {userResults.length > 0 && userSearch.length >= 2 && (
                  <ScrollView
                    style={{
                      maxHeight: 150,
                      borderWidth: 1,
                      borderColor: '#ccc',
                      marginTop: 8,
                    }}
                  >
                    {userResults
                      .filter((u) => !players.some((p) => p.userId === u.id))
                      .map((user) => (
                        <TouchableOpacity
                          key={user.id}
                          onPress={() => addPlayer(user)}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: '#eee',
                          }}
                        >
                          <Text>{user.username}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                )}
              </YStack>
            )}
          </Card>

          {/* Create Button */}
          <Button
            size="$5"
            backgroundColor="$green10"
            color="white"
            onPress={() => void handleCreate()}
            disabled={!gameName.trim() || players.length < 2 || submitting}
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
