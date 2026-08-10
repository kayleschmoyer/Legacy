import React, { useMemo, useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import {
  brand,
  darkText,
  scaleDark,
  withAlpha,
} from '@legacy-sports/design-tokens';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { BaseballCard } from './BaseballCard';

interface DraftCompleteViewProps {
  league: { isMockDraft?: boolean; name?: string } | null | undefined;
  leagueId: number | null;
  pickHistory: DraftPickRecord[];
  myTeamId: number | null;
  myTeam: DraftPlayer[];
  myTeamPicks: DraftPickRecord[];
  leagueTeams: LeagueTeam[];
  statsLookup: Map<number, DraftPlayer>;
  onNavigate: (path: string) => void;
}

// Matches the sticky nav height the live draft board root also sits below,
// so this full-screen state stays flush with the nav bar — same values as
// DraftStateScreens' DraftRootShell (LS-9060).
const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

// Fixed "night stadium" bloom — deliberately not theme-adaptive (matches the
// original decorative background layer). Colors resolved via `withAlpha`
// from named design tokens rather than literal hex/rgba (theme-compliance
// ratchet). Identical to DraftStateScreens' BG_FX_IMAGE (LS-9060) since both
// screens share the same decorative background.
const BG_FX_IMAGE = [
  `radial-gradient(ellipse 80% 50% at 15% 15%, ${withAlpha(brand.gold, 0.06)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 60% 40% at 85% 80%, ${withAlpha(brand.navy, 0.08)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 40% 30% at 50% 50%, ${withAlpha(scaleDark.blue9, 0.04)} 0%, transparent 60%)`,
].join(', ');

interface RosterCardGridProps {
  picks: DraftPickRecord[];
  players: DraftPlayer[];
  emptyMessage?: string;
}

/** Roster grid — 3-across on web, wraps to fewer columns on narrow widths.
 * CSS Grid has no RN equivalent, so this uses the flexWrap idiom already
 * established for grid-like layouts in this feature (DraftStateScreens'
 * skeleton player grid). */
function RosterCardGrid({
  picks,
  players,
  emptyMessage,
}: RosterCardGridProps): React.JSX.Element {
  return (
    <>
      <XStack flexWrap="wrap" gap={10} style={{ paddingTop: 4 }}>
        {picks.map((pick, i) => {
          const player = players[i];
          if (!player) return null;
          return (
            <YStack key={pick.id} width="31%" minWidth={140}>
              <BaseballCard
                player={player}
                round={pick.round}
                pickNumber={pick.pickNumber}
                overallPick={pick.overallPick}
              />
            </YStack>
          );
        })}
      </XStack>

      {picks.length === 0 && emptyMessage && (
        <Text color="$textMuted" fontSize={13} textAlign="center" padding={24}>
          {emptyMessage}
        </Text>
      )}
    </>
  );
}

export function DraftCompleteView({
  league,
  leagueId,
  pickHistory,
  myTeamId,
  myTeam,
  myTeamPicks,
  leagueTeams,
  statsLookup,
  onNavigate,
}: DraftCompleteViewProps): React.JSX.Element {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    myTeamId !== null ? String(myTeamId) : null,
  );

  const selectedTeamPicks = useMemo(
    () =>
      selectedTeamId
        ? pickHistory.filter((p) => String(p.teamId) === selectedTeamId)
        : myTeamPicks,
    [pickHistory, selectedTeamId, myTeamPicks],
  );

  const selectedTeamPlayers: DraftPlayer[] = useMemo(
    () =>
      selectedTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        const name = pick.player
          ? `${pick.player.firstName} ${pick.player.lastName}`
          : `Unknown Player (ID: ${pick.playerId})`;
        return {
          id: pick.playerId,
          name,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [selectedTeamPicks, statsLookup],
  );

  const selectedTeamName = useMemo(() => {
    if (!selectedTeamId) return 'Your Roster';
    const team = leagueTeams.find((t) => String(t.id) === selectedTeamId);
    return team?.name ?? 'Unknown Team';
  }, [selectedTeamId, leagueTeams]);

  const isViewingOwnTeam =
    selectedTeamId !== null && selectedTeamId === String(myTeamId);

  return (
    <YStack
      testID="draft-complete-banner"
      style={{
        position: 'fixed',
        top: NAV_HEIGHT_PX,
        right: 0,
        bottom: 0,
        left: 0,
      }}
      zIndex={NAV_Z_INDEX - 2}
      backgroundColor="$background"
      overflow="hidden"
    >
      <YStack
        position="absolute"
        inset={0}
        pointerEvents="none"
        style={{ backgroundImage: BG_FX_IMAGE }}
      />

      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$4"
        padding="$8"
        position="relative"
        zIndex={1}
      >
        <Text fontSize={56} lineHeight={56} role="img" aria-label="trophy">
          {'🏆'}
        </Text>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={36}
          color="$brandGold"
          letterSpacing={0.7}
          textAlign="center"
        >
          Draft Complete!
        </Text>
        <Text
          fontSize={14}
          color="$textMuted"
          maxWidth={380}
          lineHeight={21}
          textAlign="center"
        >
          {league?.isMockDraft
            ? `All ${pickHistory.length} picks have been made. No rosters were saved — this was a practice draft.`
            : `All ${pickHistory.length} picks have been made. Your roster is set!`}
        </Text>

        {/* Action buttons — shown for real (non-mock) drafts */}
        {!league?.isMockDraft && (
          <XStack
            gap="$3"
            flexWrap="wrap"
            justifyContent="center"
            marginTop="$2"
          >
            <Button
              onPress={() => onNavigate(`/baseball/league/${leagueId}/roster`)}
              backgroundColor="$brandGold"
              color="white"
              fontWeight="700"
              fontSize={14}
              height={44}
              paddingHorizontal={28}
              borderRadius="$4"
              pressStyle={{ scale: 0.98 }}
              hoverStyle={{ backgroundColor: '$brandGoldDark' }}
            >
              Set My Lineup
            </Button>
            <Button
              onPress={() => onNavigate(`/baseball/league/${leagueId}`)}
              backgroundColor={withAlpha(darkText.fg1Strong, 0.1)}
              color="white"
              fontWeight="700"
              fontSize={14}
              height={44}
              paddingHorizontal={28}
              borderRadius="$4"
              pressStyle={{ scale: 0.98 }}
              hoverStyle={{
                backgroundColor: withAlpha(darkText.fg1Strong, 0.16),
              }}
            >
              Back to League
            </Button>
          </XStack>
        )}

        {/* Mock draft buttons */}
        {league?.isMockDraft && (
          <XStack
            gap="$3"
            flexWrap="wrap"
            justifyContent="center"
            marginTop="$2"
          >
            <Button
              onPress={() => onNavigate('/baseball/mock-draft')}
              backgroundColor="$brandGold"
              color="white"
              fontWeight="700"
              fontSize={14}
              height={44}
              paddingHorizontal={28}
              borderRadius="$4"
              pressStyle={{ scale: 0.98 }}
              hoverStyle={{ backgroundColor: '$brandGoldDark' }}
            >
              Practice Again
            </Button>
            <Button
              onPress={() => onNavigate('/baseball')}
              backgroundColor={withAlpha(darkText.fg1Strong, 0.1)}
              color="white"
              fontWeight="700"
              fontSize={14}
              height={44}
              paddingHorizontal={28}
              borderRadius="$4"
              pressStyle={{ scale: 0.98 }}
              hoverStyle={{
                backgroundColor: withAlpha(darkText.fg1Strong, 0.16),
              }}
            >
              Go to My Leagues
            </Button>
          </XStack>
        )}

        {/* Team selector + roster cards */}
        {leagueTeams.length > 0 && (
          <YStack maxWidth={480} width="100%" marginTop="$6">
            {/* Team tab bar */}
            <XStack
              gap={6}
              flexWrap="wrap"
              justifyContent="center"
              marginBottom="$4"
            >
              {leagueTeams.map((team) => {
                const isActive = selectedTeamId === String(team.id);
                const isMe = String(team.id) === String(myTeamId);
                return (
                  <Button
                    key={team.id}
                    onPress={() => setSelectedTeamId(String(team.id))}
                    height="auto"
                    paddingHorizontal={14}
                    paddingVertical={6}
                    borderRadius={20}
                    borderWidth={1}
                    borderColor={
                      isActive
                        ? '$brandGold'
                        : withAlpha(darkText.fg1Strong, 0.15)
                    }
                    backgroundColor={
                      isActive
                        ? withAlpha(brand.gold, 0.2)
                        : withAlpha(darkText.fg1Strong, 0.05)
                    }
                    color={isActive ? '$brandGoldLight' : '$textMuted'}
                    fontSize={12}
                    fontWeight={isActive ? '700' : '500'}
                  >
                    {`${team.name}${isMe ? ' (You)' : ''}`}
                  </Button>
                );
              })}
            </XStack>

            {/* Roster header */}
            <Text
              fontSize={14}
              fontWeight="700"
              marginBottom={12}
              color="$brandGold"
              letterSpacing={1}
              textTransform="uppercase"
            >
              {isViewingOwnTeam
                ? `Your Roster (${selectedTeamPlayers.length} players)`
                : `${selectedTeamName} (${selectedTeamPlayers.length} players)`}
            </Text>

            {/* Roster cards */}
            <RosterCardGrid
              picks={selectedTeamPicks}
              players={selectedTeamPlayers}
              emptyMessage="No picks found for this team."
            />
          </YStack>
        )}

        {/* Fallback: show own roster if no teams data */}
        {leagueTeams.length === 0 && myTeam.length > 0 && (
          <YStack maxWidth={400} width="100%" marginTop="$4">
            <Text
              fontSize={14}
              fontWeight="700"
              marginBottom={12}
              color="$brandGold"
              letterSpacing={1}
              textTransform="uppercase"
            >
              Your Roster ({myTeam.length} players)
            </Text>
            <RosterCardGrid picks={myTeamPicks} players={myTeam} />
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}
