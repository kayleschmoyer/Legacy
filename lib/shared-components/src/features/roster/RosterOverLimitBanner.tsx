/**
 * RosterOverLimitBanner — roster-limit lock notice (LS-10477).
 *
 * A trade always completes even if it takes a team over the league roster
 * limit. Afterwards the team is locked from every roster move except
 * releasing players (the server rejects the rest with `ROSTER_OVER_LIMIT`).
 * This banner tells the manager how many players to release and gives them
 * the release path inline, so web and native render the same prompt on the
 * roster/team pages and in the trading center.
 *
 * `RosterOverLimitBanner` is presentational; `RosterOverLimitNotice` is the
 * data-bound wrapper that renders nothing unless the team is over the limit.
 */
import React, { useState } from 'react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Text, XStack, YStack } from 'tamagui';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetTeamMembersQuery,
  useGetTeamRosterLimitQuery,
  useReleasePlayerMutation,
} from '@legacy-sports/graphql';
import { Button } from '../../Button';

export interface RosterOverLimitPlayer {
  playerId: number;
  name: string;
}

export interface RosterOverLimitBannerProps {
  rosterSize: number;
  maxRosterSize: number;
  playersToRelease: number;
  players: RosterOverLimitPlayer[];
  onRelease: (playerId: number) => void;
  /** Player whose release is in flight — its row shows a spinner. */
  releasingPlayerId?: number | null;
  errorMessage?: string | null;
}

function pluralPlayers(n: number): string {
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}

export function RosterOverLimitBanner({
  rosterSize,
  maxRosterSize,
  playersToRelease,
  players,
  onRelease,
  releasingPlayerId = null,
  errorMessage = null,
}: RosterOverLimitBannerProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // Two-tap release: the first tap arms the row, the second confirms. Works
  // the same on web and native without a platform-specific confirm dialog.
  const [armedPlayerId, setArmedPlayerId] = useState<number | null>(null);
  const busy = releasingPlayerId != null;

  return (
    <YStack
      role="alert"
      data-testid="roster-over-limit-banner"
      borderRadius="$4"
      borderWidth={1}
      backgroundColor="$orange3"
      borderColor="$orange7"
      padding="$3"
      gap="$2"
    >
      <XStack gap="$2" alignItems="flex-start">
        <YStack paddingTop="$0.5">
          <AlertTriangle size={18} color="var(--orange11)" />
        </YStack>
        <YStack flex={1} minWidth={0} gap="$1">
          <Text fontSize="$3" fontWeight="700" color="$orange11">
            Roster over the limit — release {pluralPlayers(playersToRelease)}
          </Text>
          <Text fontSize="$2" color="$orange11">
            You have {rosterSize} players and the league limit is{' '}
            {maxRosterSize}. Until you release {pluralPlayers(playersToRelease)}
            , adds, waiver claims, and trades that keep you over the limit are
            blocked. Released players become free agents.
          </Text>
        </YStack>
      </XStack>

      <XStack>
        <Button
          size="sm"
          variant="outlined"
          data-testid="roster-over-limit-toggle"
          onPress={() => {
            setExpanded((v) => !v);
            setArmedPlayerId(null);
          }}
        >
          {expanded ? 'Hide players' : 'Release players'}
        </Button>
      </XStack>

      {errorMessage ? (
        <Text fontSize="$2" color="$red11" role="alert">
          {errorMessage}
        </Text>
      ) : null}

      {expanded ? (
        <YStack gap="$1" data-testid="roster-over-limit-player-list">
          {players.map((p) => {
            const armed = armedPlayerId === p.playerId;
            return (
              <XStack
                key={p.playerId}
                alignItems="center"
                justifyContent="space-between"
                gap="$2"
                paddingVertical="$1"
              >
                <Text fontSize="$3" color="$color" flex={1} numberOfLines={1}>
                  {p.name}
                </Text>
                <Button
                  size="sm"
                  variant={armed ? 'danger' : 'outlined'}
                  aria-label={
                    armed ? `Confirm release ${p.name}` : `Release ${p.name}`
                  }
                  loading={releasingPlayerId === p.playerId}
                  disabled={busy}
                  onPress={() => {
                    if (armed) {
                      setArmedPlayerId(null);
                      onRelease(p.playerId);
                    } else {
                      setArmedPlayerId(p.playerId);
                    }
                  }}
                >
                  {armed ? 'Confirm release' : 'Release'}
                </Button>
              </XStack>
            );
          })}
        </YStack>
      ) : null}
    </YStack>
  );
}

export interface RosterOverLimitNoticeProps {
  leagueId: number;
  /** The viewer's own team. Do not render for teams the viewer does not manage. */
  teamId: number;
}

export function RosterOverLimitNotice({
  leagueId,
  teamId,
}: RosterOverLimitNoticeProps): React.JSX.Element | null {
  const { data } = useGetTeamRosterLimitQuery({
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network',
  });
  const [releasingPlayerId, setReleasingPlayerId] = useState<number | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [releasePlayer] = useReleasePlayerMutation({
    refetchQueries: ['GetTeamRosterLimit', 'GetTeamMembers'],
    awaitRefetchQueries: true,
  });

  const status = data?.team?.rosterLimitStatus;
  // Player names for the release list — only needed (and only fetched) while
  // the team is over the limit; the roster page already has this cached.
  const { data: membersData } = useGetTeamMembersQuery({
    variables: { teamId },
    skip: !teamId || !status?.isOverLimit,
  });
  if (!status?.isOverLimit) return null;

  const players: RosterOverLimitPlayer[] = (
    membersData?.teamMembers ?? []
  ).flatMap((m) =>
    m.playerId == null
      ? []
      : [
          {
            playerId: m.playerId,
            name:
              `${m.player?.firstName ?? ''} ${m.player?.lastName ?? ''}`.trim() ||
              `Player #${m.playerId}`,
          },
        ],
  );

  const handleRelease = async (playerId: number) => {
    setErrorMessage(null);
    setReleasingPlayerId(playerId);
    try {
      await releasePlayer({ variables: { leagueId, playerId } });
    } catch (err) {
      // Server-side rejections (BAD_USER_INPUT, ROSTER_OVER_LIMIT, …) carry
      // user-facing copy; anything else (network, unexpected) stays generic.
      if (CombinedGraphQLErrors.is(err) && err.errors[0]?.message) {
        setErrorMessage(err.errors[0].message);
      } else {
        LOGGER.error(
          'Failed to release player from over-limit roster',
          err instanceof Error ? err : new Error(String(err)),
          { leagueId, teamId, playerId },
        );
        setErrorMessage('Could not release that player. Please try again.');
      }
    } finally {
      setReleasingPlayerId(null);
    }
  };

  return (
    <RosterOverLimitBanner
      rosterSize={status.rosterSize}
      maxRosterSize={status.maxRosterSize}
      playersToRelease={status.playersToRelease}
      players={players}
      onRelease={(id) => void handleRelease(id)}
      releasingPlayerId={releasingPlayerId}
      errorMessage={errorMessage}
    />
  );
}
