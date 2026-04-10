import React from 'react';
import {
  Button,
  Card,
  H1,
  H2,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useGetSeasonDraftGamesQuery } from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

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

/** Status colors use Tamagui theme tokens so they stay theme-aware and consistent. */
const STATUS_COLORS: Record<string, string> = {
  setup: '$amber10',
  drafting: '$green9',
  completed: '$blue10',
  cancelled: '$textMuted',
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
  const { data, loading, refetch } = useGetSeasonDraftGamesQuery();
  const games = (data?.seasonDraftGames ?? []) as GameSummary[];

  const activeGames = games.filter(
    (g) => g.status === 'drafting' || g.status === 'setup',
  );
  const completedGames = games.filter(
    (g) => g.status === 'completed' || g.status === 'cancelled',
  );

  if (loading && games.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" space="$3">
        <Spinner size="large" color="$brandGold" />
        <Text color="$textMuted">Loading games…</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* ── Header: left/title/right flex layout for reliable centering ── */}
      <XStack
        paddingHorizontal="$5"
        paddingVertical="$4"
        backgroundColor="$brandNavy"
        alignItems="center"
      >
        <XStack flex={1} justifyContent="flex-start">
          {onBack && (
            <Button
              size="$3"
              chromeless
              color="white"
              onPress={onBack}
              pressStyle={{ opacity: 0.7 }}
            >
              ← Back
            </Button>
          )}
        </XStack>

        <H1 color="white" fontSize="$6" textAlign="center">
          Season Draft Games
        </H1>

        <XStack flex={1} justifyContent="flex-end">
          <Button
            size="$3"
            backgroundColor="$brandGold"
            color="$brandNavy"
            fontWeight="700"
            onPress={onCreateGame}
            pressStyle={{ backgroundColor: '$brandGoldDark' }}
          >
            + New Game
          </Button>
        </XStack>
      </XStack>

      <ScrollView>
        <YStack
          padding="$4"
          space="$5"
          maxWidth={680}
          alignSelf="center"
          width="100%"
        >
          {/* ── Empty state ── */}
          {games.length === 0 && (
            <Card
              padding="$6"
              alignItems="center"
              backgroundColor="$surfaceCard"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              space="$3"
            >
              <H2 color="white" textAlign="center">
                No games yet
              </H2>
              <Text color="$textMuted" textAlign="center" maxWidth={340}>
                Create your first Season Draft Game and challenge your friends!
              </Text>
              <Button
                size="$4"
                marginTop="$2"
                backgroundColor="$brandGold"
                color="$brandNavy"
                fontWeight="700"
                onPress={onCreateGame}
                pressStyle={{ backgroundColor: '$brandGoldDark' }}
              >
                Create Game
              </Button>
            </Card>
          )}

          {/* ── Active Games ── */}
          {activeGames.length > 0 && (
            <YStack space="$2">
              <H2 color="white" fontSize="$5">
                Active Games
              </H2>
              <Separator borderColor="$surfacePanelBorder" />
              {activeGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onPress={() => onSelectGame(game.id)}
                />
              ))}
            </YStack>
          )}

          {/* ── Past Games ── */}
          {completedGames.length > 0 && (
            <YStack space="$2">
              <H2 color="white" fontSize="$5">
                Past Games
              </H2>
              <Separator borderColor="$surfacePanelBorder" />
              {completedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onPress={() => onSelectGame(game.id)}
                  muted
                />
              ))}
            </YStack>
          )}

          {/* ── Refresh ── */}
          <Button
            size="$3"
            variant="outlined"
            alignSelf="center"
            borderColor="$surfacePanelBorder"
            color="$textMuted"
            onPress={() => void refetch()}
          >
            Refresh
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
};

// ── GameCard ────────────────────────────────────────────────────────────────

interface GameCardProps {
  game: GameSummary;
  onPress: () => void;
  muted?: boolean;
}

function GameCard({
  game,
  onPress,
  muted = false,
}: GameCardProps): React.JSX.Element {
  const isYourTurn = game.isMyTurn && game.status === 'drafting';

  return (
    <Card
      padding="$4"
      backgroundColor={
        isYourTurn ? withAlpha(BRAND_NAVY_LIGHT, 0.4) : '$surfaceCard'
      }
      borderColor={isYourTurn ? '$brandGold' : '$surfacePanelBorder'}
      borderWidth={1}
      opacity={muted ? 0.65 : 1}
      onPress={onPress}
      pressStyle={{ scale: 0.98 }}
      hoverStyle={{
        borderColor: isYourTurn ? '$brandGold' : '$brandNavyLight',
      }}
      cursor="pointer"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack flex={1} space="$1">
          <Text fontSize="$5" fontWeight="700" color="white">
            {game.name}
          </Text>
          <XStack space="$2" alignItems="center">
            <Text fontSize="$2" color="$textMuted">
              {game.playerType === 'pitcher' ? 'Pitcher' : 'Hitter'}
            </Text>
            <Text fontSize="$2" color="$textMuted">
              ·
            </Text>
            <Text fontSize="$2" color="$textMuted">
              {STAT_LABELS[game.statKey] ?? game.statKey}
            </Text>
            <Text fontSize="$2" color="$textMuted">
              ·
            </Text>
            <Text fontSize="$2" color="$textMuted">
              {game.gameMode === 'career_team' ? 'Career' : 'Season'}
            </Text>
          </XStack>
        </YStack>

        <YStack alignItems="flex-end" space="$1">
          <XStack alignItems="center" space="$1">
            <YStack
              width={6}
              height={6}
              borderRadius={3}
              backgroundColor={STATUS_COLORS[game.status]}
            />
            <Text
              fontSize="$2"
              color={STATUS_COLORS[game.status]}
              fontWeight="600"
            >
              {STATUS_LABELS[game.status]}
            </Text>
          </XStack>

          {isYourTurn && (
            <XStack
              backgroundColor="$brandGold"
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$1"
            >
              <Text fontSize="$1" color="$brandNavy" fontWeight="800">
                YOUR TURN
              </Text>
            </XStack>
          )}
        </YStack>
      </XStack>
    </Card>
  );
}

export default SeasonDraftGameLobby;
