import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  H3,
  Input,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  TeamMemberFragment,
  useGetLeagueByIdQuery,
  useGetLeagueTeamsQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useGetUserTeamIdQuery,
  useUpdateTeamBrandingMutation,
} from '../../api/db/graphql.generated';
import { TeamAssistantManagerSettings } from '../../features/baseball/TeamAssistantManagerSettings';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

/**
 * TeamDetailPage - Display team roster and allow editing for General Managers.
 *
 * LS-355: GMs can now set a team avatar (logo) and banner image via HTTPS URL.
 */
export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const teamIdNum = parseInt(teamId || '0');

  // Local state for branding form
  const [avatarInput, setAvatarInput] = useState('');
  const [bannerInput, setBannerInput] = useState('');
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [bannerImgError, setBannerImgError] = useState(false);

  // Get team members (which includes leagueId)
  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
  } = useGetTeamMembersQuery({
    variables: { teamId: teamIdNum },
    skip: !teamId,
  });

  // Get team details from leagueTeams query
  const leagueId = membersData?.teamMembers?.[0]?.leagueId;
  const {
    data: teamsData,
    loading: teamsLoading,
    refetch: refetchTeams,
  } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get user's team in this league to check ownership
  const { data: userTeamData, loading: userTeamLoading } =
    useGetUserTeamIdQuery({
      variables: { leagueId: leagueId || 0 },
      skip: !leagueId,
    });

  // Get league details including the user's permission level
  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueId || 0 },
    skip: !leagueId,
  });

  // Get league positions to map positionId → positionType (e.g. "SP", "C")
  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      variables: { leagueId: leagueId || 0 },
      skip: !leagueId,
    });

  const positionMap = useMemo(() => {
    const map = new Map<number, string>();
    positionsData?.leaguePositions?.forEach((pos) => {
      if (pos.id != null && pos.positionType) {
        map.set(pos.id, pos.positionType);
      }
    });
    return map;
  }, [positionsData]);

  const [updateTeamBranding, { loading: brandingLoading }] =
    useUpdateTeamBrandingMutation();

  const userPermissionLevel =
    leagueData?.league?.userMembership?.permissionLevel;

  // A user is the GM if their teamId matches AND they have owner/general_manager permission
  const isOwner = userTeamData?.userTeamId === teamIdNum;
  const isGM =
    isOwner &&
    (userPermissionLevel === 'owner' ||
      userPermissionLevel === 'general_manager');

  const loading =
    membersLoading ||
    teamsLoading ||
    userTeamLoading ||
    leagueLoading ||
    positionsLoading;

  if (loading) return <Spinner />;
  if (membersError)
    return <Text>Error loading team: {membersError.message}</Text>;
  if (!membersData?.teamMembers) return <Text>Team not found</Text>;

  // Find the team from leagueTeams
  const team = teamsData?.leagueTeams?.find(
    (t: { id?: number | null }) => t?.id === teamIdNum,
  );
  const teamMembers = membersData.teamMembers;

  const currentAvatarUrl = team?.avatarUrl ?? null;
  const currentBannerUrl = team?.bannerUrl ?? null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveBranding = async () => {
    if (!leagueId) return;
    setBrandingError(null);
    setBrandingSuccess(false);

    // Validate: if either field is non-empty it must be HTTPS
    const trimmedAvatar = avatarInput.trim();
    const trimmedBanner = bannerInput.trim();

    if (trimmedAvatar && !/^https:\/\//i.test(trimmedAvatar)) {
      setBrandingError('Avatar URL must start with https://');
      return;
    }
    if (trimmedBanner && !/^https:\/\//i.test(trimmedBanner)) {
      setBrandingError('Banner URL must start with https://');
      return;
    }

    // If both are empty, nothing to save
    if (!trimmedAvatar && !trimmedBanner) {
      setBrandingError('Enter at least one URL to save.');
      return;
    }

    try {
      await updateTeamBranding({
        variables: {
          teamId: teamIdNum,
          leagueId,
          // Only send a field if the input is non-empty
          ...(trimmedAvatar ? { avatarUrl: trimmedAvatar } : {}),
          ...(trimmedBanner ? { bannerUrl: trimmedBanner } : {}),
        },
      });
      await refetchTeams();
      setAvatarInput('');
      setBannerInput('');
      setAvatarImgError(false);
      setBannerImgError(false);
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to save branding',
      );
    }
  };

  const handleClearAvatar = async () => {
    if (!leagueId) return;
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await updateTeamBranding({
        variables: {
          teamId: teamIdNum,
          leagueId,
          avatarUrl: '',
        },
      });
      await refetchTeams();
      setAvatarImgError(false);
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to clear avatar',
      );
    }
  };

  const handleClearBanner = async () => {
    if (!leagueId) return;
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await updateTeamBranding({
        variables: {
          teamId: teamIdNum,
          leagueId,
          bannerUrl: '',
        },
      });
      await refetchTeams();
      setBannerImgError(false);
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to clear banner',
      );
    }
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
            />
          ) : (
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: 'white',
                lineHeight: '1',
              }}
            >
              {(team?.name ?? 'T').charAt(0).toUpperCase()}
            </Text>
          )}
        </YStack>

        {/* Name + visitor note */}
        <YStack gap="$1" flex={1}>
          <Text fontSize="$8" fontWeight="bold" $sm={{ fontSize: '$6' }}>
            {team?.name || 'Team'}
          </Text>
          {leagueId && (
            <Text fontSize="$3" color="$gray11">
              League ID: {leagueId}
            </Text>
          )}
          {!isOwner && (
            <Text fontSize="$3" color="$gray11" fontStyle="italic">
              You are viewing this team as a visitor. Only the General Manager
              can make changes.
            </Text>
          )}
        </YStack>
      </XStack>

      {/* ── Roster ── */}
      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold">
          Roster
        </Text>
        {teamMembers.map(
          (member: TeamMemberFragment | null) =>
            member && (
              <YStack
                key={member.id}
                padding="$3"
                backgroundColor="$gray2"
                borderRadius="$4"
              >
                <Text fontWeight="bold">
                  {member.player?.firstName} {member.player?.lastName}
                </Text>
                <Text fontSize="$2" color="$gray11">
                  {member.positionId != null
                    ? (positionMap.get(member.positionId) ?? 'Unassigned')
                    : 'Unassigned'}
                </Text>
              </YStack>
            ),
        )}
      </YStack>

      {/* ── GM Settings ── */}
      {isGM && leagueId && (
        <>
          <Separator />
          <YStack gap="$4">
            <H3>Team Settings</H3>

            {/* Team Branding */}
            <YStack
              gap="$3"
              padding="$4"
              borderRadius="$4"
              borderWidth={1}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
              backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
            >
              <Text
                fontSize="$5"
                fontWeight="600"
                style={{ color: BRAND_GOLD_LIGHT }}
              >
                Team Branding
              </Text>
              <Text fontSize="$3" color="$gray11">
                Personalise your team with a logo and banner. Provide public
                HTTPS image URLs (e.g. from Imgur, Discord CDN, or similar).
              </Text>

              {/* Avatar URL */}
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="500">
                  Avatar URL{' '}
                  <Text fontSize="$2" color="$gray11">
                    (team logo / icon)
                  </Text>
                </Text>
                {currentAvatarUrl && (
                  <XStack gap="$2" alignItems="center">
                    <Text
                      fontSize="$2"
                      color="$gray11"
                      flex={1}
                      numberOfLines={1}
                      style={{ wordBreak: 'break-all' }}
                    >
                      Current: {currentAvatarUrl}
                    </Text>
                    <Button
                      size="$2"
                      chromeless
                      onPress={handleClearAvatar}
                      disabled={brandingLoading}
                      style={{ color: BRAND_SEAM_RED }}
                    >
                      Clear
                    </Button>
                  </XStack>
                )}
                <Input
                  value={avatarInput}
                  onChangeText={setAvatarInput}
                  placeholder="https://example.com/my-logo.png"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </YStack>

              {/* Banner URL */}
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="500">
                  Banner URL{' '}
                  <Text fontSize="$2" color="$gray11">
                    (header image)
                  </Text>
                </Text>
                {currentBannerUrl && (
                  <XStack gap="$2" alignItems="center">
                    <Text
                      fontSize="$2"
                      color="$gray11"
                      flex={1}
                      numberOfLines={1}
                      style={{ wordBreak: 'break-all' }}
                    >
                      Current: {currentBannerUrl}
                    </Text>
                    <Button
                      size="$2"
                      chromeless
                      onPress={handleClearBanner}
                      disabled={brandingLoading}
                      style={{ color: BRAND_SEAM_RED }}
                    >
                      Clear
                    </Button>
                  </XStack>
                )}
                <Input
                  value={bannerInput}
                  onChangeText={setBannerInput}
                  placeholder="https://example.com/my-banner.jpg"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </YStack>

              {/* Feedback */}
              {brandingError && (
                <Text fontSize="$3" style={{ color: BRAND_SEAM_RED }}>
                  {brandingError}
                </Text>
              )}
              {brandingSuccess && (
                <Text fontSize="$3" style={{ color: '#22c55e' }}>
                  Branding saved!
                </Text>
              )}

              <Button
                onPress={handleSaveBranding}
                disabled={brandingLoading || (!avatarInput && !bannerInput)}
                style={{
                  backgroundColor:
                    brandingLoading || (!avatarInput && !bannerInput)
                      ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                      : BRAND_NAVY_LIGHT,
                  color: 'white',
                }}
                hoverStyle={{ backgroundColor: BRAND_NAVY }}
                pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                alignSelf="flex-start"
              >
                {brandingLoading ? 'Saving…' : 'Save Branding'}
              </Button>
            </YStack>

            {/* Assistant Manager Settings */}
            <TeamAssistantManagerSettings
              teamId={teamIdNum}
              leagueId={leagueId}
            />
          </YStack>
        </>
      )}
    </YStack>
  );
}
