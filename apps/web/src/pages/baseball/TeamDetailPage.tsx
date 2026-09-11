import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import type { ErrorLike } from '@apollo/client';
import { Button, H3, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { Skeleton } from '@legacy-sports/shared-components/ui';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
  useGetLeagueNameQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamByIdQuery,
  useGetTeamMembersQuery,
  useGetViewerMembershipQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { RosterBoard } from '@legacy-sports/shared-components/roster';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import { TeamAssistantManagerSettings } from '../../features/baseball/TeamAssistantManagerSettings';
import { TeamBrandingSettings } from '../../features/teams/TeamBrandingSettings';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { trackTeamViewed } from '../../utils/analytics';
import { useIsPremium } from '../../hooks/useIsPremium';

/**
 * TeamDetailPage - Display team roster and allow editing for General Managers.
 *
 * LS-355: GMs can now set a team avatar (logo) and banner image via HTTPS URL.
 * LS-1810: GMs can upload custom logo images, screened for NSFW content via Cloudflare AI.
 * LS-6046: GMs can also set primary/secondary team colors, ungated (colors are
 * a free capability — see the ticket's Technical Approach for the precedent).
 */
export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const isValidTeamId = /^\d+$/.test(teamId ?? '');
  const teamIdNum = isValidTeamId ? parseInt(teamId ?? '', 10) : 0;

  // Local state for the identity header's image rendering only — the
  // branding form itself lives in TeamBrandingSettings.
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [bannerImgError, setBannerImgError] = useState(false);

  // Get team members (which includes leagueId)
  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useGetTeamMembersQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  // Fetch team row directly — provides leagueId for empty-roster teams (LS-1330),
  // and is the sole source of team data (LS-6036 — the legacy leagueTeams-find
  // fallback fetched every team's full row in the league just to locate this one).
  const {
    data: teamByIdData,
    loading: teamByIdLoading,
    refetch: refetchTeamById,
  } = useGetTeamByIdQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  // leagueId: prefer from members (populated after draft), fall back to teamById
  const leagueId =
    membersData?.teamMembers?.[0]?.leagueId ?? teamByIdData?.team?.leagueId;

  // Get the viewer's membership row (teamId + permissionLevel) for this
  // league in one lightweight fetch (LS-6036 — replaces a full
  // useGetLeagueByIdQuery fetch that pulled ~40 league fields, and the
  // separate userTeamId "best team across the league" query). Scoped to a
  // single membership row rather than the highest-priority role across all
  // of the viewer's memberships, so an assistant manager on this team still
  // resolves correctly even if they GM a different team (BTD-028/LS-6051).
  const {
    data: viewerMembershipData,
    loading: viewerMembershipLoading,
    error: viewerMembershipError,
  } = useGetViewerMembershipQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get league positions to map positionId → positionType (e.g. "SP", "C")
  const {
    data: positionsData,
    loading: positionsLoading,
    error: positionsError,
  } = useGetPositionsForLeagueQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get the league's display name for the "Part of <league>" link (LS-6052)
  // without the full league object.
  const { data: leagueNameData } = useGetLeagueNameQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  const leaguePositions = useMemo<readonly LeaguePositionFragment[]>(
    () =>
      (positionsData?.leaguePositions ?? []).filter(
        (p): p is LeaguePositionFragment => p != null,
      ),
    [positionsData],
  );

  const team = teamByIdData?.team;

  useEffect(() => {
    if (teamIdNum && leagueId) {
      trackTeamViewed(teamIdNum, leagueId);
    }
  }, [teamIdNum, leagueId]);

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
        err instanceof Error ? err : String(err),
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
        err instanceof Error ? err : String(err),
        { teamMemberId: occupant.id },
      );
    }
  };

  const handleLineupSwap = async (
    incoming: TeamMemberFragment,
    target: LeaguePositionFragment,
    displaced: TeamMemberFragment,
  ) => {
    if (incoming.id == null || displaced.id == null || target.id == null)
      return;
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
        err instanceof Error ? err : String(err),
        { teamMemberIdA: incoming.id, teamMemberIdB: displaced.id },
      );
    }
  };

  const userPermissionLevel =
    viewerMembershipData?.viewerMembership?.permissionLevel;
  const userMembershipTeamId = viewerMembershipData?.viewerMembership?.teamId;

  // isOwner must be scoped to THIS team's membership row, not the user's
  // "best" team across the league (BTD-028): a user who is a GM of a
  // different team and an assistant_manager of this one still needs edit
  // access here. isGM mirrors the backend's own check in
  // verifyTeamEditAccess/updateTeamBranding (LS-6024) — assistant_manager
  // is a valid edit-access permission level, not just owner/GM.
  const isOwner = userMembershipTeamId === teamIdNum;
  const isCommissioner = userPermissionLevel === 'commissioner';
  const isGM =
    isOwner &&
    (userPermissionLevel === 'general_manager' ||
      userPermissionLevel === 'assistant_manager');
  // Inviting/removing assistant managers stays GM/commissioner-only — the
  // backend explicitly excludes assistant_manager from these mutations.
  const canManageAssistantManagers =
    isCommissioner || (isOwner && userPermissionLevel === 'general_manager');

  const isPremium = useIsPremium();

  // Gates team identity + roster — the data those sections need to render.
  // teamByIdLoading is excluded once `team` has already loaded once (LS-9670):
  // TeamBrandingSettings' onBrandingUpdated callback calls refetchTeamById()
  // after every save/clear, and Apollo briefly flips teamByIdLoading to true
  // for that refetch. Without this guard, the whole page (identity, roster,
  // and the branding section itself) would unmount to this full-page spinner
  // and remount on every branding save — discarding TeamBrandingSettings'
  // in-flight "Branding saved!" success state along with it.
  const identityLoading =
    membersLoading || (teamByIdLoading && !team) || positionsLoading;

  // Gates only the GM/Commissioner settings section. Identity and roster
  // render as soon as their own data is available instead of waiting on
  // permission data too (LS-6048). Ownership and permission level both come
  // from the single viewerMembership fetch (LS-6051 + LS-6036), so its
  // loading flag alone is sufficient — there is no separate ownership query.
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

  if (membersError) {
    const graphQLErrors = CombinedGraphQLErrors.is(membersError)
      ? membersError.errors
      : [];
    const isNotFound = graphQLErrors.some(
      (e) => e.extensions?.['code'] === 'NOT_FOUND',
    );
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
  const renderQueryErrorState = (
    error: ErrorLike | undefined,
    logMessage: string,
  ) => {
    if (!error) return null;
    LOGGER.error(logMessage, error, { teamId: teamIdNum, leagueId });
    return (
      <YStack padding="$6" gap="$3" alignItems="center">
        <H3>Error loading team</H3>
        <Text color="$colorSubtle">
          We couldn&apos;t load this team. Please retry.
        </Text>
      </YStack>
    );
  };

  const viewerMembershipErrorState = renderQueryErrorState(
    viewerMembershipError,
    'Failed to load viewer league membership',
  );
  if (viewerMembershipErrorState) return viewerMembershipErrorState;

  const teamMembers = membersData.teamMembers;

  const currentAvatarUrl = team?.avatarUrl ?? null;
  const currentBannerUrl = team?.bannerUrl ?? null;

  const handleBrandingUpdated = async () => {
    await refetchTeamById();
    setAvatarImgError(false);
    setBannerImgError(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <YStack
      padding="$4"
      $sm={{ padding: '$3' }}
      gap="$4"
      maxWidth={900}
      width="100%"
      alignSelf="center"
    >
      <PageMeta
        title={team?.name ? `${team.name} Team` : 'Team Roster'}
        description={`View and manage the ${team?.name ?? 'team'} fantasy baseball roster on Legacy Sports.`}
      />
      <Button onPress={() => navigate(-1)} alignSelf="flex-start">
        Back
      </Button>

      {/* ── Banner ── */}
      {currentBannerUrl && !bannerImgError && (
        <YStack
          borderRadius="$4"
          overflow="hidden"
          height={160}
          $sm={{ height: 100 }}
          style={{ position: 'relative' }}
        >
          <img
            src={currentBannerUrl}
            alt={`${team?.name ?? 'Team'} banner`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setBannerImgError(true)}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
          />
        </YStack>
      )}

      {/* ── Team Identity ── */}
      <XStack gap="$4" alignItems="center" $sm={{ gap: '$3' }}>
        {/* Avatar */}
        <YStack
          width={72}
          height={72}
          borderRadius="$12"
          overflow="hidden"
          borderWidth={3}
          borderColor={BRAND_NAVY_LIGHT}
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          style={{
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
          }}
        >
          {currentAvatarUrl && !avatarImgError ? (
            <img
              src={currentAvatarUrl}
              alt={`${team?.name ?? 'Team'} avatar`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={() => setAvatarImgError(true)}
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Text fontSize="$8" fontWeight="bold" color="white">
              {(team?.name ?? 'T').charAt(0).toUpperCase()}
            </Text>
          )}
        </YStack>

        {/* Name + visitor note */}
        <YStack gap="$1" flex={1}>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text fontSize="$8" fontWeight="bold" $sm={{ fontSize: '$6' }}>
              {team?.name || 'Team'}
            </Text>
            {isOwner && isPremium && (
              <XStack
                testID="team-premium-badge"
                backgroundColor={withAlpha(BRAND_GOLD, 0.16)}
                borderWidth={1}
                borderColor={withAlpha(BRAND_GOLD, 0.4)}
                borderRadius={9999}
                paddingVertical={2}
                paddingHorizontal={8}
              >
                <Text
                  fontWeight="700"
                  fontSize={10}
                  letterSpacing={1.4}
                  textTransform="uppercase"
                  color={BRAND_GOLD_LIGHT}
                >
                  Premium
                </Text>
              </XStack>
            )}
          </XStack>
          {leagueId && leagueNameData?.leagueName && (
            <Button
              unstyled
              size="$1"
              data-testid="team-detail-league-link"
              onPress={() => navigate(`/baseball/league/${leagueId}`)}
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
                Part of {leagueNameData.leagueName}
              </Text>
            </Button>
          )}
          {!permissionLoading && !isOwner && !isCommissioner && (
            <Text fontSize="$3" color="$gray11" fontStyle="italic">
              You are viewing this team as a visitor. Only the General Manager
              can make changes.
            </Text>
          )}
        </YStack>
      </XStack>

      {/* ── Roster / Lineup Editor (LS-5360) ── */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold">
          Roster
        </Text>
        <RosterBoard<TeamMemberFragment, LeaguePositionFragment>
          positions={leaguePositions}
          teamPlayers={teamMembers.filter(
            (m): m is TeamMemberFragment => m != null,
          )}
          onPlayerAssign={(player, position) => {
            void handleLineupAssign(player, position);
          }}
          onPlayerRemove={(position) => {
            void handleLineupRemove(position);
          }}
          onPlayerSwap={(incoming, target, displaced) => {
            void handleLineupSwap(incoming, target, displaced);
          }}
          readOnly={!isGM}
          error={positionsError}
        />
      </YStack>

      {/* ── GM / Commissioner Settings — inline skeleton while permission
           data resolves, so identity/roster above don't wait on it ── */}
      {permissionLoading && leagueId && (
        <>
          <Separator />
          <YStack gap="$4" aria-label="Loading team settings">
            <Skeleton width={160} height={24} />
            <Skeleton width="100%" height={140} radius={8} />
          </YStack>
        </>
      )}

      {!permissionLoading && (isGM || isCommissioner) && leagueId && (
        <>
          <Separator />
          <YStack gap="$4">
            <H3>Team Settings</H3>

            <TeamBrandingSettings
              teamId={teamIdNum}
              leagueId={leagueId}
              avatarUrl={currentAvatarUrl}
              bannerUrl={currentBannerUrl}
              primaryColor={team?.primaryColor}
              secondaryColor={team?.secondaryColor}
              onBrandingUpdated={handleBrandingUpdated}
            />

            {/* Assistant Manager Settings — GM/commissioner only; the backend
                restricts invite/remove to those roles (BTD-001 / LS-6024) */}
            {canManageAssistantManagers && (
              <TeamAssistantManagerSettings
                teamId={teamIdNum}
                leagueId={leagueId}
              />
            )}
          </YStack>
        </>
      )}
    </YStack>
  );
}
