import React from 'react';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Circle, Stack } from './primitives';
import {
  SeasonDraftGameMode,
  SeasonDraftGameStatus,
  SeasonDraftPlayerType,
  useGetSeasonDraftGamesQuery,
} from '../../api/db/graphql.generated';
import { BRAND_GOLD, WHITE, withAlpha } from '../../utils/colors';

const STAT_LABELS: Record<string, string> = {
  hr: 'HR',
  h: 'H',
  rbi: 'RBI',
  sb: 'SB',
  r: 'R',
  doubles: '2B',
  triples: '3B',
  bb: 'BB',
  tb: 'TB',
  w: 'W',
  so: 'SO',
  sv: 'SV',
  sho: 'SHO',
  cg: 'CG',
};

const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup',
  drafting: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface LobbyGame {
  id: number;
  name: string;
  status: SeasonDraftGameStatus;
  statKey: string;
  gameMode: SeasonDraftGameMode;
  playerType: SeasonDraftPlayerType;
  isMyTurn: boolean;
  playerCount: number;
  maxPlayers: number;
  picksMade: number;
  totalPicks: number;
  winnerName: string | null;
  players: Array<{ id: number; playerName: string }>;
}

/**
 * Map a generated query summary (where nearly every field is nullable)
 * into the strict shape the UI consumes. Returns `null` when the row is
 * missing the `id` we'd need to navigate to it — those entries are
 * filtered out rather than rendered with a sentinel id of 0.
 */
function toLobbyGame(
  g: NonNullable<
    NonNullable<
      ReturnType<typeof useGetSeasonDraftGamesQuery>['data']
    >['seasonDraftGames']
  >[number],
): LobbyGame | null {
  if (g.id == null) return null;
  return {
    id: g.id,
    name: g.name ?? '',
    status: g.status ?? SeasonDraftGameStatus.Setup,
    statKey: g.statKey ?? '',
    gameMode: g.gameMode ?? SeasonDraftGameMode.Season,
    playerType: g.playerType ?? SeasonDraftPlayerType.Hitter,
    isMyTurn: g.isMyTurn ?? false,
    playerCount: g.playerCount ?? 0,
    maxPlayers: g.maxPlayers ?? 6,
    picksMade: g.picksMade ?? 0,
    totalPicks: g.totalPicks ?? 0,
    winnerName: g.winnerName ?? null,
    players: (g.players ?? []).map((p) => ({
      id: p.id,
      playerName: p.playerName,
    })),
  };
}

interface SeasonDraftGameLobbyProps {
  onSelectGame: (gameId: number) => void;
  onCreateGame: () => void;
  onJoinByInvite?: () => void;
  onBack?: () => void;
  /** Override for the current viewer's name (used to mark "You" avatars). */
  viewerName?: string;
}

/**
 * Season Draft Lobby
 *
 * Lists all draft games for the current viewer, grouped by Active and Past.
 * Cross-platform Tamagui implementation; renders identically on web and native.
 */
export const SeasonDraftGameLobby: React.FC<SeasonDraftGameLobbyProps> = ({
  onSelectGame,
  onCreateGame,
  onJoinByInvite,
  onBack,
  viewerName,
}) => {
  // `cache-and-network` ensures we always trigger a network refetch on
  // mount so newly created/joined games appear after navigating back to
  // the lobby, while still rendering the cached list immediately.
  const { data, loading } = useGetSeasonDraftGamesQuery({
    fetchPolicy: 'cache-and-network',
  });
  const games: LobbyGame[] = (data?.seasonDraftGames ?? [])
    .map(toLobbyGame)
    .filter((g): g is LobbyGame => g !== null);

  const active = games.filter(
    (g) =>
      g.status === SeasonDraftGameStatus.Drafting ||
      g.status === SeasonDraftGameStatus.Setup,
  );
  const past = games.filter(
    (g) =>
      g.status === SeasonDraftGameStatus.Completed ||
      g.status === SeasonDraftGameStatus.Cancelled,
  );

  if (loading && games.length === 0) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color="$brandGold" />
        <Text color="$textMuted">Loading games…</Text>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack
        width="100%"
        maxWidth={1100}
        alignSelf="center"
        padding="$5"
        $sm={{ padding: '$3' }}
        gap="$5"
      >
        {onBack && (
          <Button
            chromeless
            size="$2"
            alignSelf="flex-start"
            color="$textMuted"
            onPress={onBack}
            pressStyle={{ opacity: 0.7 }}
          >
            ← Back to Games
          </Button>
        )}

        <XStack
          gap="$4"
          alignItems="flex-end"
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <YStack gap="$2" flex={1} minWidth={280}>
            <Eyebrow color="$brandGoldLight">
              Multiplayer · Season Draft
            </Eyebrow>
            <H1
              color="$color"
              fontSize={44}
              lineHeight={44}
              letterSpacing={-1}
              fontWeight="800"
            >
              Season Draft Games
            </H1>
            <Paragraph color="$textMuted" maxWidth={560}>
              Draft hitters or pitchers, pick the right season, rack up the
              counting stats. Last one standing with the biggest number wins.
            </Paragraph>
          </YStack>

          <XStack gap="$2" alignItems="center">
            {onJoinByInvite && (
              <Button
                size="$3"
                variant="outlined"
                borderColor="$surfacePanelBorder"
                color="$color"
                onPress={onJoinByInvite}
              >
                Join by Invite
              </Button>
            )}
            <Button
              size="$3"
              backgroundColor="$brandGold"
              color="$brandNavy"
              fontWeight="800"
              onPress={onCreateGame}
              pressStyle={{ backgroundColor: '$brandGoldDark' }}
            >
              + New Game
            </Button>
          </XStack>
        </XStack>

        {games.length === 0 ? (
          <EmptyState onCreate={onCreateGame} />
        ) : (
          <YStack gap="$5">
            {active.length > 0 && (
              <Section
                title="Active"
                count={`${active.length} live`}
                games={active}
                onSelect={onSelectGame}
                viewerName={viewerName}
              />
            )}
            {past.length > 0 && (
              <Section
                title="Past"
                count={String(past.length)}
                games={past}
                onSelect={onSelectGame}
                viewerName={viewerName}
                muted
              />
            )}
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
};

// ── Section ─────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: string;
  games: LobbyGame[];
  onSelect: (gameId: number) => void;
  viewerName: string | undefined;
  muted?: boolean;
}

function Section({
  title,
  count,
  games,
  onSelect,
  viewerName,
  muted,
}: SectionProps): React.JSX.Element {
  return (
    <YStack gap="$3">
      <XStack alignItems="baseline" gap="$3">
        <H2 color="$color" fontSize={22} fontWeight="800">
          {title}
        </H2>
        <Text color="$textMuted" fontSize={12} textTransform="uppercase">
          {count}
        </Text>
      </XStack>
      <XStack flexWrap="wrap" gap="$3" rowGap="$3" opacity={muted ? 0.78 : 1}>
        {games.map((g) => (
          <LobbyCard
            key={g.id}
            game={g}
            onPress={() => onSelect(g.id)}
            viewerName={viewerName}
          />
        ))}
      </XStack>
    </YStack>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  game: LobbyGame;
  onPress: () => void;
  viewerName: string | undefined;
}

function LobbyCard({
  game,
  onPress,
  viewerName,
}: CardProps): React.JSX.Element {
  const isYourTurn =
    game.isMyTurn && game.status === SeasonDraftGameStatus.Drafting;
  const accentColor =
    game.status === SeasonDraftGameStatus.Drafting
      ? '$green9'
      : game.status === SeasonDraftGameStatus.Setup
        ? '$brandGoldLight'
        : game.status === SeasonDraftGameStatus.Completed
          ? '$brandGoldLight'
          : '$textMuted';

  return (
    <YStack
      flex={1}
      flexBasis={320}
      maxWidth={520}
      minWidth={280}
      padding="$4"
      gap="$3"
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor={isYourTurn ? '$brandGold' : '$surfacePanelBorder'}
      hoverStyle={{ borderColor: '$brandGoldLight' }}
      pressStyle={{ scale: 0.985 }}
      cursor="pointer"
      onPress={onPress}
    >
      {isYourTurn && (
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$2"
          paddingVertical="$1.5"
          borderRadius="$2"
          backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
          alignSelf="flex-start"
        >
          <Circle size={8} backgroundColor="$brandGold" />
          <Text
            fontSize={11}
            color="$brandGoldLight"
            fontWeight="800"
            letterSpacing={1.4}
            textTransform="uppercase"
          >
            Your Turn
          </Text>
        </XStack>
      )}

      <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
        <Text fontSize={20} fontWeight="800" color="$color" flex={1}>
          {game.name}
        </Text>
        <XStack
          alignItems="center"
          gap="$1.5"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$10"
          backgroundColor={withAlpha(WHITE, 0.04)}
          borderWidth={1}
          borderColor="$surfacePanelBorder"
        >
          {game.status === SeasonDraftGameStatus.Drafting && (
            <Circle size={6} backgroundColor={accentColor} />
          )}
          <Text
            fontSize={11}
            color={accentColor}
            fontWeight="700"
            letterSpacing={1}
            textTransform="uppercase"
          >
            {STATUS_LABEL[game.status]}
          </Text>
        </XStack>
      </XStack>

      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <StatChip>{STAT_LABELS[game.statKey] ?? game.statKey}</StatChip>
        <Text color="$textMuted" fontSize={13}>
          {game.playerType === SeasonDraftPlayerType.Pitcher
            ? 'Pitchers'
            : 'Hitters'}
        </Text>
        <Text color="$textMuted" fontSize={13}>
          ·
        </Text>
        <Text color="$textMuted" fontSize={13}>
          {game.gameMode === SeasonDraftGameMode.CareerTeam
            ? 'Career w/ Team'
            : 'Season'}
        </Text>
      </XStack>

      {game.status === SeasonDraftGameStatus.Completed && game.winnerName && (
        <Text fontSize={13} color="$textMuted">
          <Text role="img" accessibilityLabel="trophy">
            {'\u{1F3C6}'}
          </Text>{' '}
          Won by{' '}
          <Text fontWeight="700" color="$color">
            {game.winnerName}
          </Text>
        </Text>
      )}
      {game.status === SeasonDraftGameStatus.Cancelled && (
        <Text fontSize={13} color="$textMuted" fontStyle="italic">
          Game was cancelled.
        </Text>
      )}

      {(game.status === SeasonDraftGameStatus.Drafting ||
        game.status === SeasonDraftGameStatus.Setup) && (
        <YStack gap="$1.5">
          <ProgressBar
            value={
              game.status === SeasonDraftGameStatus.Drafting &&
              game.totalPicks > 0
                ? game.picksMade / game.totalPicks
                : 0
            }
          />
          <Text fontSize={12} color="$textMuted">
            {game.status === SeasonDraftGameStatus.Drafting
              ? // Show 1-based "current pick" — picksMade is 0-indexed (count
                // of picks already locked in), so the pick *currently* on the
                // clock is min(picksMade + 1, totalPicks).
                `Pick ${Math.min(game.picksMade + 1, game.totalPicks)}/${game.totalPicks}`
              : `Waiting · ${game.playerCount}/${game.maxPlayers} joined`}
          </Text>
        </YStack>
      )}

      <PlayerAvatars
        players={game.players}
        max={game.maxPlayers}
        viewerName={viewerName}
        showEmptySlot={game.status === SeasonDraftGameStatus.Setup}
      />
    </YStack>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Eyebrow({
  children,
  color = '$textMuted',
}: {
  children: React.ReactNode;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      letterSpacing={1.6}
      textTransform="uppercase"
      color={color}
      fontWeight="700"
    >
      {children}
    </Text>
  );
}

function StatChip({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Stack
      paddingHorizontal="$2"
      paddingVertical="$1"
      backgroundColor={withAlpha(BRAND_GOLD, 0.14)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.4)}
      borderRadius="$2"
    >
      <Text
        fontSize={11}
        color="$brandGoldLight"
        fontWeight="800"
        letterSpacing={1}
      >
        {children}
      </Text>
    </Stack>
  );
}

function ProgressBar({ value }: { value: number }): React.JSX.Element {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <Stack
      width="100%"
      height={4}
      borderRadius={999}
      backgroundColor="$surfacePanelBorder"
      overflow="hidden"
    >
      <Stack height="100%" width={`${pct}%`} backgroundColor="$brandGold" />
    </Stack>
  );
}

function PlayerAvatars({
  players,
  max,
  viewerName,
  showEmptySlot,
}: {
  players: Array<{ id: number; playerName: string }>;
  max: number;
  viewerName: string | undefined;
  showEmptySlot: boolean;
}): React.JSX.Element {
  return (
    <XStack gap="$1.5" flexWrap="wrap">
      {players.map((p) => {
        const isMe = viewerName != null && p.playerName === viewerName;
        return <Avatar key={p.id} label={p.playerName} highlighted={isMe} />;
      })}
      {showEmptySlot && players.length < max && <Avatar label="+" empty />}
    </XStack>
  );
}

function Avatar({
  label,
  highlighted,
  empty,
}: {
  label: string;
  highlighted?: boolean;
  empty?: boolean;
}): React.JSX.Element {
  const initial = label.length > 0 ? label.charAt(0).toUpperCase() : '?';
  return (
    <Circle
      size={28}
      backgroundColor={
        empty
          ? 'transparent'
          : highlighted
            ? '$brandGold'
            : '$surfacePanelBorder'
      }
      borderWidth={empty ? 1 : 0}
      borderStyle={empty ? 'dashed' : undefined}
      borderColor="$surfacePanelBorder"
    >
      <Text
        fontSize={12}
        fontWeight="800"
        color={empty ? '$textMuted' : highlighted ? '$brandNavy' : '$color'}
      >
        {empty ? '+' : initial}
      </Text>
    </Circle>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <YStack
      alignItems="center"
      gap="$3"
      padding="$6"
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderStyle="dashed"
    >
      <Text fontSize={48} role="img" accessibilityLabel="trophy">
        {'\u{1F3C6}'}
      </Text>
      <H3 color="$color" fontSize={20}>
        No games yet
      </H3>
      <Text color="$textMuted" textAlign="center" maxWidth={360}>
        Start your first season draft and invite up to five friends.
      </Text>
      <Button
        size="$4"
        backgroundColor="$brandGold"
        color="$brandNavy"
        fontWeight="800"
        marginTop="$2"
        onPress={onCreate}
        pressStyle={{ backgroundColor: '$brandGoldDark' }}
      >
        Create First Game
      </Button>
    </YStack>
  );
}

export default SeasonDraftGameLobby;
