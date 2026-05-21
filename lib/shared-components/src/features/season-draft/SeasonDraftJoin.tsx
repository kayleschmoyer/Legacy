import React, { useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Button, H1, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { Circle, Stack } from './primitives';
import { SPORT_LOBBY_CHROME, toSportKind } from './sportChrome';
import {
  SeasonDraftGameMode,
  SeasonDraftGameStatus,
  SeasonDraftPlayerType,
  useGetSeasonDraftGameByInviteCodeQuery,
  useJoinSeasonDraftGameMutation,
} from '../../api/db/graphql.generated';
import { BRAND_GOLD, withAlpha } from '../../utils/colors';

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

interface SeasonDraftJoinProps {
  inviteCode: string;
  onJoined: (gameId: number) => void;
  onCancel: () => void;
  onBrowseGames?: () => void;
  /** Override the displayed viewer name in the empty seat. */
  viewerName?: string;
}

/**
 * Season Draft Join
 *
 * Invite-link landing page. Renders a "ticket" preview of the draft along
 * with a roster strip showing already-claimed seats, then a primary CTA to
 * claim a seat. Cross-platform Tamagui implementation.
 */
export const SeasonDraftJoin: React.FC<SeasonDraftJoinProps> = ({
  inviteCode,
  onJoined,
  onCancel,
  onBrowseGames,
  viewerName,
}) => {
  const [joinError, setJoinError] = useState<string | null>(null);

  const { data, loading } = useGetSeasonDraftGameByInviteCodeQuery({
    variables: { inviteCode },
    skip: !inviteCode,
  });

  const [joinGame, { loading: joining }] = useJoinSeasonDraftGameMutation();
  const game = data?.seasonDraftGameByInviteCode;
  const sport = toSportKind(game?.sport);
  const sportChrome = SPORT_LOBBY_CHROME[sport];

  const handleJoin = async () => {
    if (!inviteCode) return;
    setJoinError(null);
    try {
      const result = await joinGame({ variables: { inviteCode } });
      const gameId = result.data?.joinSeasonDraftGame;
      if (gameId) {
        onJoined(gameId);
      } else {
        setJoinError('Failed to join game. Please try again.');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to join season draft game', err);
      setJoinError(joinErrorMessageFor(error));
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack
        width="100%"
        maxWidth={620}
        alignSelf="center"
        padding="$5"
        $sm={{ padding: '$3' }}
        gap="$5"
      >
        <Button
          chromeless
          size="$2"
          alignSelf="flex-start"
          color="$textMuted"
          onPress={onCancel}
          pressStyle={{ opacity: 0.7 }}
        >
          ← Back to Lobby
        </Button>

        <YStack
          backgroundColor="$surfaceCard"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$brandGold"
          padding="$5"
          gap="$4"
        >
          <XStack
            alignItems="flex-start"
            justifyContent="space-between"
            gap="$3"
          >
            <YStack gap="$2" flex={1}>
              <Eyebrow color="$brandGoldLight">Private Invite</Eyebrow>
              <Text fontSize={28} fontWeight="800" color="$color">
                You've been invited
              </Text>
            </YStack>
            <Stack
              padding="$2"
              borderRadius="$3"
              backgroundColor={withAlpha(BRAND_GOLD, 0.15)}
            >
              <Text fontSize={20} role="img" accessibilityLabel="trophy">
                {'\u{1F3C6}'}
              </Text>
            </Stack>
          </XStack>

          <Stack
            height={1}
            width="100%"
            backgroundColor="$surfacePanelBorder"
          />

          {loading && (
            <YStack alignItems="center" gap="$2" paddingVertical="$4">
              <Spinner size="large" color="$brandGold" />
              <Text color="$textMuted">Loading game info…</Text>
            </YStack>
          )}

          {!loading && !game && (
            <YStack alignItems="center" gap="$3" paddingVertical="$3">
              <Text color="$brandSeamRedLight" textAlign="center">
                This invite link is invalid or the game no longer exists.
              </Text>
              {onBrowseGames && (
                <Button
                  size="$3"
                  backgroundColor="$brandNavyLight"
                  color="$brandGold"
                  onPress={onBrowseGames}
                >
                  Browse Games
                </Button>
              )}
            </YStack>
          )}

          {!loading && game && (
            <YStack gap="$4" data-sport={sport}>
              <YStack gap="$1">
                <XStack alignItems="center" gap="$2">
                  <Text
                    fontSize={16}
                    role="img"
                    accessibilityLabel={sportChrome.iconLabel}
                  >
                    {sportChrome.icon}
                  </Text>
                  <Text
                    data-testid="sport-strapline"
                    fontSize={11}
                    color="$brandGoldLight"
                    letterSpacing={1.6}
                    textTransform="uppercase"
                    fontWeight="700"
                  >
                    {sportChrome.strapline}
                  </Text>
                </XStack>
                <H1 color="$color" fontSize={26} fontWeight="800">
                  {game.name}
                </H1>
                <Text color="$textMuted">
                  Hosted by{' '}
                  <Text color="$color" fontWeight="700">
                    {game.creatorName ?? 'a friend'}
                  </Text>
                </Text>
              </YStack>

              <XStack flexWrap="wrap" gap="$3">
                <DetailItem label="Sport">{sportChrome.shortLabel}</DetailItem>
                <DetailItem label="Stat">
                  {game.statKey
                    ? (STAT_LABELS[game.statKey] ?? game.statKey)
                    : '—'}
                </DetailItem>
                <DetailItem label="Pool">
                  {sport === 'football'
                    ? 'Gridiron'
                    : game.playerType === SeasonDraftPlayerType.Pitcher
                      ? 'Pitchers'
                      : 'Hitters'}
                </DetailItem>
                <DetailItem label="Mode">
                  {game.gameMode === SeasonDraftGameMode.CareerTeam
                    ? 'Career w/ Team'
                    : game.gameMode === SeasonDraftGameMode.MostTeams
                      ? 'Most Teams'
                      : 'Season'}
                </DetailItem>
                <DetailItem label="Players">
                  {game.playerCount} / {game.maxPlayers ?? 6}
                </DetailItem>
              </XStack>

              <YStack gap="$2">
                <Text
                  fontSize={11}
                  color="$textMuted"
                  letterSpacing={1.4}
                  textTransform="uppercase"
                  fontWeight="700"
                >
                  Roster
                </Text>
                <RosterStrip
                  players={(game.players ?? [])
                    .filter(
                      (p): p is { id: number; playerName: string } =>
                        p?.id != null && p?.playerName != null,
                    )
                    .map((p) => ({ id: p.id, playerName: p.playerName }))}
                  max={game.maxPlayers ?? 6}
                  viewerName={viewerName}
                />
              </YStack>

              <YStack gap="$1">
                <Text
                  fontSize={11}
                  color="$textMuted"
                  letterSpacing={1.4}
                  textTransform="uppercase"
                  fontWeight="700"
                >
                  Invite Code
                </Text>
                <Stack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="$surfacePanelBorder"
                  backgroundColor="$background"
                  borderStyle="dashed"
                >
                  <Text
                    fontFamily="$mono"
                    fontSize={18}
                    color="$brandGoldLight"
                    fontWeight="700"
                    letterSpacing={2}
                  >
                    {inviteCode}
                  </Text>
                </Stack>
              </YStack>

              {game.status !== SeasonDraftGameStatus.Setup && (
                <Text color="$brandGoldLight" fontSize={13}>
                  {game.status === SeasonDraftGameStatus.Drafting
                    ? 'This game has already started.'
                    : 'This game is no longer accepting players.'}
                </Text>
              )}

              {joinError && (
                <Text color="$brandSeamRedLight" fontSize={13}>
                  {joinError}
                </Text>
              )}

              <XStack gap="$2" justifyContent="flex-end">
                <Button
                  variant="outlined"
                  borderColor="$surfacePanelBorder"
                  color="$textMuted"
                  size="$3"
                  onPress={onCancel}
                  disabled={joining}
                >
                  Cancel
                </Button>
                <Button
                  size="$4"
                  backgroundColor="$brandGold"
                  color="$brandNavy"
                  fontWeight="800"
                  disabled={
                    joining || game.status !== SeasonDraftGameStatus.Setup
                  }
                  onPress={() => void handleJoin()}
                  pressStyle={{ backgroundColor: '$brandGoldDark' }}
                >
                  {joining ? 'Joining…' : 'Claim Your Seat'}
                </Button>
              </XStack>
            </YStack>
          )}
        </YStack>
      </YStack>
    </ScrollView>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a join-game failure to a user-facing message using the GraphQL error
 * code (`extensions.code`) returned by the backend. Falls back to a generic
 * message when no code is present, e.g. for network errors. We intentionally
 * do NOT inspect the error message string — those are subject to change.
 */
export function joinErrorMessageFor(error: unknown): string {
  const code = extractGraphQLErrorCode(error);
  switch (code) {
    case 'SEASON_DRAFT_GAME_ALREADY_STARTED':
      return 'This game has already started and is no longer accepting players.';
    case 'SEASON_DRAFT_GAME_FULL':
      return 'This game is already full.';
    default:
      return 'Failed to join game. Please try again.';
  }
}

function extractGraphQLErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const graphQLErrors = (error as { graphQLErrors?: unknown }).graphQLErrors;
  if (!Array.isArray(graphQLErrors)) return undefined;
  for (const gqlError of graphQLErrors as ReadonlyArray<unknown>) {
    if (gqlError == null || typeof gqlError !== 'object') continue;
    const extensions = (gqlError as { extensions?: unknown }).extensions;
    if (extensions == null || typeof extensions !== 'object') continue;
    const code = (extensions as Record<string, unknown>)['code'];
    if (typeof code === 'string') return code;
  }
  return undefined;
}

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

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <YStack
      flex={1}
      flexBasis={120}
      minWidth={100}
      gap="$1"
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderRadius="$3"
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
    >
      <Text
        fontSize={10}
        color="$textMuted"
        letterSpacing={1.4}
        textTransform="uppercase"
      >
        {label}
      </Text>
      <Text color="$color" fontWeight="700">
        {children}
      </Text>
    </YStack>
  );
}

function RosterStrip({
  players,
  max,
  viewerName,
}: {
  players: Array<{ id: number; playerName: string }>;
  max: number;
  viewerName: string | undefined;
}): React.JSX.Element {
  return (
    <XStack flexWrap="wrap" gap="$2">
      {Array.from({ length: max }).map((_, i) => {
        const p = players[i];
        const isViewer =
          p != null && viewerName != null && p.playerName === viewerName;
        return (
          <YStack
            key={p?.id ?? `empty-${i}`}
            alignItems="center"
            gap="$1"
            width={68}
          >
            <Circle
              size={40}
              backgroundColor={
                p
                  ? isViewer
                    ? '$brandGold'
                    : '$surfacePanelBorder'
                  : 'transparent'
              }
              borderWidth={p ? 0 : 1}
              borderColor="$surfacePanelBorder"
              borderStyle={p ? undefined : 'dashed'}
            >
              <Text
                fontSize={14}
                fontWeight="800"
                color={p ? (isViewer ? '$brandNavy' : '$color') : '$textMuted'}
              >
                {p ? p.playerName.charAt(0).toUpperCase() : ''}
              </Text>
            </Circle>
            <Text
              fontSize={10}
              color="$textMuted"
              numberOfLines={1}
              textAlign="center"
            >
              {p ? (isViewer ? 'You' : p.playerName) : 'Empty'}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

export default SeasonDraftJoin;
