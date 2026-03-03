import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Card, H2, H3, Text, XStack, YStack } from 'tamagui';
import { useGetSeasonDraftGamesQuery } from '../../api/db/graphql.generated';

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

interface GameSummary {
  id: number;
  name: string;
  status: 'setup' | 'drafting' | 'completed' | 'cancelled';
  statKey: string;
  gameMode: 'season' | 'career_team';
  playerType: 'hitter' | 'pitcher';
  isMyTurn: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  setup: '$yellow10',
  drafting: '$green10',
  completed: '$blue10',
  cancelled: '$red10',
};

const STATUS_LABELS: Record<string, string> = {
  setup: 'Setup',
  drafting: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface SeasonDraftGameLobbyProps {
  onSelectGame: (gameId: number) => void;
  onCreateGame: () => void;
  onBack?: () => void;
}

/**
 * Season Draft Game Lobby
 *
 * Lists all games for the current user with status badges,
 * "your turn" indicators, and a create game button.
 */
export const SeasonDraftGameLobby: React.FC<SeasonDraftGameLobbyProps> = ({
  onSelectGame,
  onCreateGame,
  onBack,
}) => {
  const { data, loading, refetch } = useGetSeasonDraftGamesQuery({
    pollInterval: 10000,
  });
  const games = (data?.seasonDraftGames ?? []) as GameSummary[];

  const activeGames = games.filter(
    (g) => g.status === 'drafting' || g.status === 'setup',
  );
  const completedGames = games.filter(
    (g) => g.status === 'completed' || g.status === 'cancelled',
  );

  if (loading && games.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text marginTop="$2">Loading games...</Text>
      </View>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Header */}
      <XStack
        padding="$4"
        backgroundColor="$blue10"
        justifyContent="space-between"
        alignItems="center"
      >
        {onBack && (
          <Button size="$3" onPress={onBack}>
            ← Back
          </Button>
        )}
        <H2 color="white" flex={1} textAlign="center">
          Season Draft Games
        </H2>
        <Button size="$3" onPress={onCreateGame}>
          + New Game
        </Button>
      </XStack>

      <ScrollView>
        <YStack padding="$4" space="$4">
          {/* Create Game CTA */}
          {games.length === 0 && (
            <Card padding="$6" alignItems="center">
              <H3 marginBottom="$2">No games yet</H3>
              <Text color="$gray10" marginBottom="$4" textAlign="center">
                Create your first Season Draft Game and challenge your friends!
              </Text>
              <Button
                size="$5"
                backgroundColor="$green10"
                color="white"
                onPress={onCreateGame}
              >
                Create Game
              </Button>
            </Card>
          )}

          {/* Active Games */}
          {activeGames.length > 0 && (
            <YStack>
              <H3 marginBottom="$2">Active Games</H3>
              {activeGames.map((game) => (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => onSelectGame(game.id)}
                >
                  <Card
                    padding="$4"
                    marginBottom="$2"
                    borderLeftWidth={4}
                    borderLeftColor={
                      game.isMyTurn && game.status === 'drafting'
                        ? '$green10'
                        : '$gray6'
                    }
                  >
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack flex={1}>
                        <Text fontSize="$5" fontWeight="bold">
                          {game.name}
                        </Text>
                        <XStack space="$2" marginTop="$1">
                          <Text fontSize="$2" color="$gray10">
                            {game.playerType === 'pitcher'
                              ? 'Pitcher'
                              : 'Hitter'}
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            •
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            {STAT_LABELS[game.statKey] ?? game.statKey}
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            •
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            {game.gameMode === 'career_team'
                              ? 'Career'
                              : 'Season'}
                          </Text>
                        </XStack>
                      </YStack>
                      <YStack alignItems="flex-end">
                        <Text
                          fontSize="$2"
                          color={STATUS_COLORS[game.status]}
                          fontWeight="bold"
                        >
                          {STATUS_LABELS[game.status]}
                        </Text>
                        {game.isMyTurn && game.status === 'drafting' && (
                          <Text
                            fontSize="$3"
                            color="$green10"
                            fontWeight="bold"
                            marginTop="$1"
                          >
                            Your Turn!
                          </Text>
                        )}
                      </YStack>
                    </XStack>
                  </Card>
                </TouchableOpacity>
              ))}
            </YStack>
          )}

          {/* Completed Games */}
          {completedGames.length > 0 && (
            <YStack>
              <H3 marginBottom="$2">Past Games</H3>
              {completedGames.map((game) => (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => onSelectGame(game.id)}
                >
                  <Card padding="$4" marginBottom="$2" opacity={0.7}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack flex={1}>
                        <Text fontSize="$5" fontWeight="bold">
                          {game.name}
                        </Text>
                        <XStack space="$2" marginTop="$1">
                          <Text fontSize="$2" color="$gray10">
                            {game.playerType === 'pitcher'
                              ? 'Pitcher'
                              : 'Hitter'}
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            •
                          </Text>
                          <Text fontSize="$2" color="$gray10">
                            {STAT_LABELS[game.statKey] ?? game.statKey}
                          </Text>
                        </XStack>
                      </YStack>
                      <Text
                        fontSize="$2"
                        color={STATUS_COLORS[game.status]}
                        fontWeight="bold"
                      >
                        {STATUS_LABELS[game.status]}
                      </Text>
                    </XStack>
                  </Card>
                </TouchableOpacity>
              ))}
            </YStack>
          )}

          {/* Refresh */}
          <Button
            size="$3"
            variant="outlined"
            onPress={() => void refetch()}
            alignSelf="center"
          >
            Refresh
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
};

export default SeasonDraftGameLobby;
