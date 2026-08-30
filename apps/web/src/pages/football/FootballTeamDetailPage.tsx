import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Button, H3, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  type LeaguePositionFragment,
  Sport,
  type TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetTeamMembersQuery,
  useGetViewerMembershipQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { RosterBoard } from '@legacy-sports/shared-components/roster';
import { LOGGER } from '@legacy-sports/logging';
import { orderFootballPositions } from './footballRosterSlots';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { trackTeamViewed } from '../../utils/analytics';

/**
 * Football Team Detail (LS-6438).
 *
 * Web's football counterpart to `pages/baseball/TeamDetailPage.tsx`: team
 * identity, the shared `RosterBoard` in football mode, and GM-gated lineup
 * editing. Deliberately a sibling page rather than a `sport` prop threaded
 * through `TeamDetailPage` — that file is 1200+ lines of baseball-specific
 * settings (assistant managers, branding, colour pickers) and lives under
 * `pages/baseball/`, so parameterising it would deepen the "baseball/ serves
 * both sports" confusion the ticket calls out rather than resolving it.
 *
 * Team branding is deliberately NOT on this page in its first iteration —
 * deferred to LS-9670 so it can be routed through web's validated upload path
 * (LS-1810) rather than the native Settings tab's arbitrary-URL input (the
 * LS-6434 defect). LS-6438's AC5 permits either; deferring keeps the five
 * tickets blocked on this page from waiting on a separable capability.
 */
export function FootballTeamDetailPage(): React.JSX.Element {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  const teamIdNum = Number(teamId);
  const isValidTeamId = Number.isInteger(teamIdNum) && teamIdNum > 0;

  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useGetTeamMembersQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  const {
    data: teamByIdData,
    loading: teamByIdLoading,
    error: teamByIdError,
  } = useGetTeamByIdQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  // Prefer the leagueId off the members rows (populated after the draft) and
  // fall back to the team row, matching TeamDetailPage's resolution order.
  const leagueId =
    membersData?.teamMembers?.[0]?.leagueId ?? teamByIdData?.team?.leagueId;

  // The full league is needed here for `defensiveFormat` (AC4 — slot ordering)
  // and `sport` (the wrong-sport guard below); no lighter query exposes
  // either. In practice this is a cache hit: the only way into this page is
  // from the league detail page, which has already run GetLeagueById.
  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueId ?? 0 },
    skip: !leagueId,
  });
  const league = leagueData?.league;

  const {
    data: viewerMembershipData,
    loading: viewerMembershipLoading,
    error: viewerMembershipError,
  } = useGetViewerMembershipQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  const {
    data: positionsData,
    loading: positionsLoading,
    error: positionsError,
  } = useGetPositionsForLeagueQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  // AC4: the server returns slots alphabetically by positionType; RosterBoard
  // renders football slots in receipt order, so canonical ordering is applied
  // here, driven by the league's defensiveFormat.
  const leaguePositions = useMemo<readonly LeaguePositionFragment[]>(
    () =>
      orderFootballPositions(
        (positionsData?.leaguePositions ?? []).filter(
          (p): p is LeaguePositionFragment => p != null,
        ),
        league?.defensiveFormat,
      ),
    [positionsData, league?.defensiveFormat],
  );

  useEffect(() => {
    if (isValidTeamId && leagueId) {
      trackTeamViewed(teamIdNum, leagueId);
    }
  }, [isValidTeamId, teamIdNum, leagueId]);

  const [updateTeamMemberPosition] = useUpdateTeamMemberPositionMutation();
  const [swapTeamMemberPositions] = useSwapTeamMemberPositionsMutation();

  const handleLineupAssign = async (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => {
    if (player.id == null || position.id == null) return;
    try {
      await updateTeamMemberPosition({
        variables: { teamMemberId: player.id, positionId: position.id },
      });
      await refetchMembers();
    } catch (err: unknown) {
      LOGGER.error(
        'Failed to assign player to lineup slot',
        err instanceof Error ? err : new Error(String(err)),
        { playerId: player.id, positionId: position.id },
      );
    }
  };

  const handleLineupRemove = async (position: LeaguePositionFragment) => {
    const occupant = membersData?.teamMembers?.find(
      (m) => m?.positionId === position.id,
    );
    if (!occupant?.id) return;
    try {
      await updateTeamMemberPosition({
        variables: { teamMemberId: occupant.id, positionId: null },
      });
      await refetchMembers();
    } catch (err: unknown) {
      LOGGER.error(
        'Failed to move player to bench',
        err instanceof Error ? err : new Error(String(err)),
        { teamMemberId: occupant.id },
      );
    }
  };

  const handleLineupSwap = async (
    incoming: TeamMemberFragment,
    target: LeaguePositionFragment,
    displaced: TeamMemberFragment,
  ) => {
    if (incoming.id == null || displaced.id == null || target.id == null) {
      return;
    }
    try {
      await swapTeamMemberPositions({
        variables: {
          teamMemberIdA: incoming.id,
          positionIdA: target.id,
          teamMemberIdB: displaced.id,
          positionIdB: incoming.positionId ?? undefined,
        },
      });
      await refetchMembers();
    } catch (err: unknown) {
      LOGGER.error(
        'Failed to swap lineup positions',
        err instanceof Error ? err : new Error(String(err)),
        { teamMemberIdA: incoming.id, teamMemberIdB: displaced.id },
      );
    }
  };

  // AC3: edit access is scoped to THIS team's membership row, not the viewer's
  // "best" team across the league (BTD-028/LS-6051) — a user who GMs a
  // different team and assistant-manages this one still edits here. Mirrors
  // TeamDetailPage.tsx's derivation and the backend's verifyTeamEditAccess.
  const userPermissionLevel =
    viewerMembershipData?.viewerMembership?.permissionLevel;
  const userMembershipTeamId = viewerMembershipData?.viewerMembership?.teamId;
  const isOwner = userMembershipTeamId === teamIdNum;
  const isCommissioner = userPermissionLevel === 'commissioner';
  const isGM =
    isOwner &&
    (userPermissionLevel === 'general_manager' ||
      userPermissionLevel === 'assistant_manager');

  // `leagueLoading` is part of this gate, unlike the permission gate below:
  // the league supplies `defensiveFormat`, and rendering the board before it
  // resolves would show an IDP league its slots in DST order for a frame and
  // then re-sort them. It costs nothing to wait — `leagueId` is already known
  // by the time the members/team queries have settled, so this query is
  // in-flight (usually already cached) rather than not yet started.
  const identityLoading =
    membersLoading || teamByIdLoading || positionsLoading || leagueLoading;
  const permissionLoading = viewerMembershipLoading;

  if (!isValidTeamId) {
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>Team not found</H3>
        <Text color="$colorSubtle">
          The team you&apos;re looking for doesn&apos;t exist or the link is
          invalid.
        </Text>
      </YStack>
    );
  }

  if (identityLoading) return <Spinner />;

  if (membersError || teamByIdError) {
    const error = membersError ?? teamByIdError;
    const graphQLErrors = CombinedGraphQLErrors.is(error) ? error.errors : [];
    const isNotFound = graphQLErrors.some(
      (e) => e.extensions?.['code'] === 'NOT_FOUND',
    );
    LOGGER.error('Failed to load football team detail', error, {
      teamId: teamIdNum,
      leagueId,
    });
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>{isNotFound ? 'Team not found' : 'Error loading team'}</H3>
        <Text color="$colorSubtle">
          {isNotFound
            ? "This team doesn't exist or you may not have access to it."
            : 'Something went wrong. Please try refreshing the page.'}
        </Text>
      </YStack>
    );
  }

  if (!membersData?.teamMembers) {
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>Team not found</H3>
        <Text color="$colorSubtle">
          This team doesn&apos;t exist or you may not have access to it.
        </Text>
      </YStack>
    );
  }

  if (viewerMembershipError) {
    LOGGER.error(
      'Failed to load viewer league membership',
      viewerMembershipError,
      { teamId: teamIdNum, leagueId },
    );
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>Error loading team</H3>
        <Text color="$colorSubtle">
          We couldn&apos;t load this team. Please retry.
        </Text>
      </YStack>
    );
  }

  // A baseball team reached through the football namespace is a mis-link, not
  // a 404 — send the viewer to the page that can actually render it. `league`
  // being truthy is the load guard: `identityLoading` above already waited on
  // `leagueLoading`, so an unresolved league here means the query was skipped
  // or errored, and neither is grounds for bouncing the viewer.
  if (league && league.sport !== Sport.Football) {
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>Not a football team</H3>
        <Text color="$colorSubtle">
          This team belongs to a baseball league.
        </Text>
        <Button
          size="$3"
          onPress={() => navigate(`/baseball/teams/${teamIdNum}`)}
        >
          View the baseball team page
        </Button>
      </YStack>
    );
  }

  const team = teamByIdData?.team;
  const teamMembers = membersData.teamMembers.filter(
    (m): m is TeamMemberFragment => m != null,
  );
  const teamName = team?.name ?? 'Team';

  return (
    <YStack
      padding="$4"
      gap="$5"
      maxWidth={1100}
      width="100%"
      alignSelf="center"
    >
      <PageMeta
        title={`${teamName} · Football`}
        description={`View ${teamName}'s football roster and set its lineup.`}
      />

      {/* ── Team identity ──
           Initials only: rendering a team's saved avatar belongs with the
           branding work deferred to LS-9670, so the two land together rather
           than shipping a display with no way to change what it displays. */}
      <XStack gap="$4" alignItems="center" flexWrap="wrap">
        <YStack
          width={72}
          height={72}
          borderRadius={12}
          overflow="hidden"
          alignItems="center"
          justifyContent="center"
          style={{
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
          }}
        >
          <Text fontSize="$8" fontWeight="bold" color="white">
            {teamName.charAt(0).toUpperCase()}
          </Text>
        </YStack>

        <YStack gap="$1" flex={1}>
          <Text fontSize="$8" fontWeight="bold" $sm={{ fontSize: '$6' }}>
            {teamName}
          </Text>
          {/* `leagueId != null` rather than a truthiness check: a bare
              `{leagueId && …}` renders a literal "0" when leagueId is 0. */}
          {leagueId != null && league?.name && (
            <Button
              unstyled
              size="$1"
              data-testid="football-team-detail-league-link"
              onPress={() => navigate(`/football/league/${leagueId}`)}
              backgroundColor="transparent"
              borderWidth={0}
              padding={0}
              alignSelf="flex-start"
            >
              <Text
                fontSize="$3"
                color="$gray11"
                textDecorationLine="underline"
              >
                Part of {league.name}
              </Text>
            </Button>
          )}
          {/* AC3: visitor notice, mirroring TeamDetailPage.tsx:833-838. */}
          {!permissionLoading && !isOwner && !isCommissioner && (
            <Text fontSize="$3" color="$gray11" fontStyle="italic">
              You are viewing this team as a visitor. Only the General Manager
              can make changes.
            </Text>
          )}
        </YStack>
      </XStack>

      {/* ── Roster / Lineup editor ── */}
      <YStack
        gap="$3"
        padding="$4"
        borderRadius="$4"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
      >
        <Text fontSize="$6" fontWeight="bold">
          Roster
        </Text>
        <RosterBoard<TeamMemberFragment, LeaguePositionFragment>
          sport="football"
          positions={leaguePositions}
          teamPlayers={teamMembers}
          onPlayerAssign={(player, position) => {
            void handleLineupAssign(player, position);
          }}
          onPlayerRemove={(position) => {
            void handleLineupRemove(position);
          }}
          onPlayerSwap={(incoming, target, displaced) => {
            void handleLineupSwap(incoming, target, displaced);
          }}
          onPlayerPress={(player) => {
            const playerId = player.player?.id ?? player.playerId;
            if (playerId != null) navigate(`/football/players/${playerId}`);
          }}
          readOnly={!isGM}
          error={positionsError ?? null}
        />
      </YStack>
    </YStack>
  );
}

export default FootballTeamDetailPage;
