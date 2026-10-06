import React, { useMemo } from 'react';
import { ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { getPositionColor } from './utils';
import { buildDepthChartBuckets } from './DraftPlayerBoard';
import { DraftClockRing } from './DraftClockRing.native';
import { DraftMiniBoard } from './DraftMiniBoard.native';
import { DraftPickAnnouncement } from './DraftPickAnnouncement.native';
import { useDraftPalette } from './nativeDraftPalette';
import { resolveBoardRounds } from './nativeDraftBoard';
import { useSpectatorScreenState } from './hooks';
import type { AnnouncementData } from './hooks/useDraftUIState';
import type { SportKind } from '../../config/sports';
import { hasErrorCode } from '../../utils/graphql-errors';

// ---------------------------------------------------------------------------
// SpectatorScreen (native) — read-only live draft watch view (LS-8942).
// Mirrors the web SpectatorScreen's states with the native member screen's
// Tamagui chrome: no draft controls, no chat, no mutations.
//
// Kept as a genuine platform fork rather than folded into the web screen
// (LS-9056): the web screen renders a bespoke DOM/CSS "broadcast" tree
// (keyframe glow/shimmer animations, gradient backgrounds — see styles.ts)
// that has no Tamagui/React Native equivalent, the same pre-existing split
// as EliteDraftBoardScreen.tsx/.native.tsx for this feature area. All
// non-render wiring (draft data, WebSocket, timer, splash queue, derived
// pick/round state) lives in the shared `useSpectatorScreenState` hook so
// only the genuinely platform-divergent rendering is duplicated.
// ---------------------------------------------------------------------------

export interface SpectatorScreenProps {
  leagueId: number | null;
  onNavigate: (path: string) => void;
  websocketUrl: string;
  /** Auth token for WebSocket authentication. */
  websocketToken?: string;
  sport?: SportKind;
  /** Hold duration per pick splash — prop-tunable, defaults to ~8s. */
  minSplashMs?: number;
}

function Eyebrow({
  children,
  color = '$fg4',
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text
      fontSize={9.5}
      fontWeight="700"
      letterSpacing={2}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

function CenteredMessage({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      justifyContent="center"
      alignItems="center"
      padding="$6"
      gap="$3"
    >
      <Text fontSize={48} accessibilityRole="image" accessibilityLabel={title}>
        {icon}
      </Text>
      <Text
        fontFamily="$heading"
        fontSize={28}
        fontWeight="800"
        color="$color"
        textAlign="center"
      >
        {title.toUpperCase()}
      </Text>
      <Text
        color="$textMuted"
        textAlign="center"
        fontSize={13.5}
        maxWidth={300}
      >
        {description}
      </Text>
    </YStack>
  );
}

export function SpectatorScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  websocketToken,
  sport = 'baseball',
  minSplashMs,
}: SpectatorScreenProps): React.JSX.Element {
  const palette = useDraftPalette();

  const {
    data,
    draftComplete,
    draftPaused,
    pickTimeLimitSeconds,
    splash,
    timeRemaining,
    round,
    currentPick,
    onClockTeamName,
    recentPicks,
  } = useSpectatorScreenState({
    leagueId,
    websocketUrl,
    token: websocketToken,
    minSplashMs,
    onLeagueDeleted: () => onNavigate('/'),
  });

  const boardTeams =
    data.boardOrderedTeams.length > 0
      ? data.boardOrderedTeams
      : data.leagueTeams;

  const boardRounds = resolveBoardRounds({
    teamCount: boardTeams.length,
    pickCount: data.pickHistory.length,
    currentRound: data.currentPickInfo?.round ?? null,
    maxPickRound: data.pickHistory.reduce(
      (max, p) => Math.max(max, p.round),
      0,
    ),
  });

  const depthBuckets = useMemo(
    () =>
      buildDepthChartBuckets(
        data.leaguePositions,
        data.onClockTeamPlayers,
        sport,
        data.league?.maxRosterSize ?? null,
      ),
    [data.leaguePositions, data.onClockTeamPlayers, sport, data.league],
  );

  const announcement: AnnouncementData | null = splash.active
    ? {
        player: splash.active.player,
        pickNumber: splash.active.overallPick,
        round: splash.active.round,
        roundPickNumber: splash.active.roundPickNumber,
        isMyPick: false,
        isAuto: splash.active.isAuto,
        teamName: splash.active.teamName,
      }
    : null;

  // ---- Early returns for special states ----
  if (!leagueId) {
    return (
      <CenteredMessage
        icon="⚾"
        title="Draft Watch"
        description="Navigate to a league to watch its live draft."
      />
    );
  }

  if (data.leagueLoading && !data.leagueData) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        justifyContent="center"
        alignItems="center"
      >
        <Spinner size="large" color="$brandGold" />
        <Text marginTop="$2" color="$textMuted">
          Setting the board…
        </Text>
      </YStack>
    );
  }

  if (
    hasErrorCode(data.leagueError, 'FORBIDDEN') ||
    hasErrorCode(data.draftError, 'FORBIDDEN')
  ) {
    return (
      <CenteredMessage
        icon="🔒"
        title="This draft is private"
        description="Only league members can watch this draft."
      />
    );
  }

  if (!data.leagueLoading && !data.league) {
    return (
      <CenteredMessage
        icon="⚠️"
        title="League Not Found"
        description="This league doesn't exist or the draft is unavailable."
      />
    );
  }

  if (
    draftComplete ||
    data.leagueDraft?.draftCompletedAt ||
    data.currentPickInfo?.isComplete
  ) {
    return (
      <ScrollView flex={1} backgroundColor="$background">
        <YStack padding="$4" gap="$3" alignItems="center">
          <Text
            fontSize={44}
            accessibilityRole="image"
            accessibilityLabel="trophy"
          >
            🏆
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={28}
            fontWeight="800"
            color="$brandGoldLight"
          >
            DRAFT COMPLETE
          </Text>
          {data.league?.name && (
            <Text color="$textMuted" fontSize={13}>
              {data.league.name}
            </Text>
          )}
          {boardTeams.length > 0 && (
            <YStack
              width="100%"
              backgroundColor="$surfacePanel"
              borderWidth={1}
              borderColor="$surfacePanelBorder"
              borderRadius={12}
              padding="$3"
            >
              <DraftMiniBoard
                teams={boardTeams}
                picks={data.pickHistory}
                currentPickInfo={null}
                myTeamId={null}
                statsLookup={data.statsLookup}
                rounds={boardRounds}
              />
            </YStack>
          )}
          <YStack
            accessibilityRole="button"
            accessibilityLabel="Back to League"
            onPress={() =>
              onNavigate(
                leagueId ? `/baseball/league/${leagueId}` : '/baseball',
              )
            }
            borderWidth={1}
            borderRadius={999}
            borderColor="$outlineDefault"
            paddingVertical={7}
            paddingHorizontal={13}
            marginTop="$2"
          >
            <Text
              fontSize={11}
              fontWeight="700"
              letterSpacing={0.5}
              color="$textMuted"
            >
              BACK TO LEAGUE
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    );
  }

  if (
    data.league?.draftStatus !== 'in-progress' &&
    data.league?.draftStatus !== 'paused'
  ) {
    const scheduledAt = data.leagueDraft?.scheduledAt
      ? new Date(data.leagueDraft.scheduledAt)
      : null;
    return (
      <ScrollView flex={1} backgroundColor="$background">
        <YStack padding="$4" alignItems="center" gap="$3" marginTop="$4">
          <Text
            fontSize={44}
            accessibilityRole="image"
            accessibilityLabel="baseball"
          >
            ⚾
          </Text>
          {data.league?.name && (
            <Eyebrow color="$brandGoldLight">{data.league.name}</Eyebrow>
          )}
          <Text
            fontFamily="$heading"
            fontSize={30}
            fontWeight="800"
            color="$color"
            textAlign="center"
          >
            DRAFT DAY IS COMING
          </Text>
          <Text
            color="$textMuted"
            fontSize={13.5}
            textAlign="center"
            maxWidth={300}
          >
            {scheduledAt
              ? `Draft scheduled for ${scheduledAt.toLocaleString()}`
              : 'The draft has not started yet. The board goes live the moment the first clock starts.'}
          </Text>
          {boardTeams.length > 0 && (
            <YStack width="100%" maxWidth={360} gap="$2" marginTop="$2">
              <Eyebrow>Draft order · {boardTeams.length} teams</Eyebrow>
              {boardTeams.map((team, idx) => (
                <XStack
                  key={team.id}
                  alignItems="center"
                  gap="$2"
                  paddingVertical={9}
                  paddingHorizontal={12}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor="$surfacePanelBorder"
                  backgroundColor="$surfaceCard"
                >
                  <Text
                    fontFamily="$heading"
                    fontSize={14}
                    fontWeight="800"
                    color="$fg4"
                    width={22}
                  >
                    {idx + 1}
                  </Text>
                  <Text
                    flex={1}
                    fontSize={14.5}
                    fontWeight="600"
                    numberOfLines={1}
                    color="$color"
                  >
                    {team.name}
                  </Text>
                </XStack>
              ))}
            </YStack>
          )}
        </YStack>
      </ScrollView>
    );
  }

  // ---- Main live spectator UI ----
  return (
    <YStack flex={1} backgroundColor="$background">
      {/* ---- Slim top band ---- */}
      {/* Only the one-line clock row stays pinned; the board, depth chart and
          recent picks scroll together below it. A pinned board made the header
          eat ~half the screen and cut off the depth chart (LS-10593). */}
      <YStack
        paddingHorizontal="$3"
        paddingVertical={6}
        borderBottomWidth={1}
        backgroundColor="$surfacePanel"
        borderBottomColor="$outlineSubtle"
      >
        <XStack justifyContent="space-between" alignItems="center" gap="$3">
          <YStack flex={1} minWidth={0}>
            <Eyebrow color={draftPaused ? '$fg4' : '$brandGoldLight'}>
              {draftPaused
                ? 'Draft paused'
                : `${data.league?.name ?? 'Live draft'} · Live`}
            </Eyebrow>
            <Text
              fontFamily="$heading"
              fontSize={19}
              fontWeight="800"
              letterSpacing={0.5}
              lineHeight={21}
              color="$color"
              numberOfLines={1}
            >
              {onClockTeamName}
            </Text>
            <Text fontSize={11} color="$fg4" marginTop={1}>
              Round {round} · Pick #{currentPick}
            </Text>
          </YStack>
          <DraftClockRing
            size={44}
            secondsRemaining={timeRemaining}
            totalSeconds={pickTimeLimitSeconds}
            emphasize={false}
            paused={draftPaused}
          />
        </XStack>
      </YStack>

      <ScrollView flex={1}>
        <YStack padding="$3" gap="$3">
          {/* ---- Draft board ---- */}
          <YStack
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            borderRadius={12}
            padding="$2"
          >
            <DraftMiniBoard
              teams={boardTeams}
              picks={data.pickHistory}
              currentPickInfo={data.currentPickInfo}
              myTeamId={null}
              statsLookup={data.statsLookup}
              rounds={boardRounds}
            />
          </YStack>

          {/* ---- On-the-clock depth chart ---- */}
          <YStack
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            borderRadius={12}
            padding="$3"
            gap="$2"
          >
            <Eyebrow>On the clock</Eyebrow>
            <Text
              fontFamily="$heading"
              fontSize={17}
              fontWeight="800"
              color="$color"
              numberOfLines={1}
            >
              {onClockTeamName}
            </Text>
            {depthBuckets.map((bucket) => {
              const open = Math.max(0, bucket.total - bucket.players.length);
              return (
                <XStack
                  key={bucket.positionType}
                  alignItems="baseline"
                  gap="$2"
                  flexWrap="wrap"
                >
                  <Text
                    fontFamily="$heading"
                    fontSize={13}
                    fontWeight="800"
                    width={38}
                    color={getPositionColor(sport, bucket.positionType)}
                  >
                    {bucket.positionType}
                  </Text>
                  <Text fontSize={11} color="$textMuted">
                    {bucket.players.length}/{bucket.total}
                  </Text>
                  <Text flex={1} fontSize={12} color="$color" numberOfLines={2}>
                    {bucket.players.map((p) => p.name).join(' · ')}
                    {open > 0
                      ? `${bucket.players.length > 0 ? ' · ' : ''}${open} open`
                      : ''}
                  </Text>
                </XStack>
              );
            })}
          </YStack>

          {/* ---- Recent picks ---- */}
          <YStack
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            borderRadius={12}
            padding="$3"
            gap="$2"
          >
            <Eyebrow>Recent picks</Eyebrow>
            {recentPicks.length === 0 && (
              <Text fontSize={12} color="$textMuted">
                No picks yet
              </Text>
            )}
            {recentPicks.map((pick) => {
              const player = data.statsLookup.get(pick.playerId);
              const name = player
                ? player.name
                : pick.player
                  ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
                  : `Player #${pick.playerId}`;
              return (
                <XStack key={pick.id} alignItems="baseline" gap="$2">
                  <Text fontSize={11} color="$fg4" width={30}>
                    #{pick.overallPick}
                  </Text>
                  {player?.position && (
                    <Text
                      fontFamily="$heading"
                      fontSize={11}
                      fontWeight="800"
                      color={getPositionColor(sport, player.position)}
                    >
                      {player.position}
                    </Text>
                  )}
                  <Text
                    flex={1}
                    fontSize={12.5}
                    color="$color"
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <Text fontSize={10.5} color="$textMuted" numberOfLines={1}>
                    {data.teamNameById(pick.teamId)}
                  </Text>
                </XStack>
              );
            })}
          </YStack>
        </YStack>
      </ScrollView>

      {/* ---- Paused overlay (no resume affordance for spectators) ---- */}
      {draftPaused && (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={20}
          backgroundColor={palette.scrim}
          justifyContent="center"
          alignItems="center"
          padding="$5"
          accessibilityRole="alert"
        >
          <YStack
            backgroundColor="$surfaceRaised"
            borderWidth={1}
            borderColor="$outlineDefault"
            borderRadius={16}
            padding="$5"
            alignItems="center"
            gap="$2"
          >
            <Text
              fontSize={34}
              accessibilityRole="image"
              accessibilityLabel="paused"
            >
              ⏸️
            </Text>
            <Text
              fontFamily="$heading"
              fontSize={22}
              fontWeight="800"
              color="$color"
            >
              DRAFT PAUSED
            </Text>
            <Text fontSize={12.5} color="$textMuted" textAlign="center">
              The commissioner has paused the draft.
            </Text>
          </YStack>
        </YStack>
      )}

      {/* ---- Pick splash (queue-driven) ---- */}
      <DraftPickAnnouncement
        announcement={announcement}
        celebrate={false}
        onDismiss={splash.dismiss}
        notablePlay={
          splash.active ? data.notablePlayFor(splash.active.player.id) : null
        }
      />
    </YStack>
  );
}
