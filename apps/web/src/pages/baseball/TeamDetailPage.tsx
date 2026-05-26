import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  H3,
  Input,
  Paragraph,
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
  useGetTeamByIdQuery,
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
import { getCsrfToken } from '../../lib/csrf';
import { trackTeamViewed } from '../../utils/analytics';
import { env } from '../../config/environment';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * TeamDetailPage - Display team roster and allow editing for General Managers.
 *
 * LS-355: GMs can now set a team avatar (logo) and banner image via HTTPS URL.
 * LS-1810: GMs can upload custom logo images, screened for NSFW content via Cloudflare AI.
 */
export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const isValidTeamId = /^\d+$/.test(teamId ?? '');
  const teamIdNum = isValidTeamId ? parseInt(teamId ?? '', 10) : 0;

  // Local state for branding form
  const [avatarInput, setAvatarInput] = useState('');
  const [bannerInput, setBannerInput] = useState('');
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [bannerImgError, setBannerImgError] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [pendingClear, setPendingClear] = useState<'logo' | 'banner' | null>(
    null,
  );

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  // Get team members (which includes leagueId)
  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
  } = useGetTeamMembersQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  // Fetch team row directly — provides leagueId for empty-roster teams (LS-1330)
  const { data: teamByIdData, loading: teamByIdLoading } = useGetTeamByIdQuery({
    variables: { teamId: teamIdNum },
    skip: !isValidTeamId,
  });

  // leagueId: prefer from members (populated after draft), fall back to teamById
  const leagueId =
    membersData?.teamMembers?.[0]?.leagueId ?? teamByIdData?.teamById?.leagueId;
  const {
    data: teamsData,
    loading: teamsLoading,
    error: teamsError,
    refetch: refetchTeams,
  } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get user's team in this league to check ownership
  const {
    data: userTeamData,
    loading: userTeamLoading,
    error: userTeamError,
  } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get league details including the user's permission level
  const {
    data: leagueData,
    loading: leagueLoading,
    error: leagueError,
  } = useGetLeagueByIdQuery({
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

  useEffect(() => {
    if (teamIdNum && leagueId) {
      trackTeamViewed(teamIdNum, leagueId);
    }
  }, [teamIdNum, leagueId]);

  const [updateTeamBranding, { loading: brandingLoading }] =
    useUpdateTeamBrandingMutation();

  const userPermissionLevel =
    leagueData?.league?.userMembership?.permissionLevel;

  // A user is the GM if their teamId matches AND they have owner/general_manager permission
  const isOwner = userTeamData?.userTeamId === teamIdNum;
  const isCommissioner = userPermissionLevel === 'commissioner';
  const isGM =
    isOwner &&
    (userPermissionLevel === 'owner' ||
      userPermissionLevel === 'general_manager');

  const loading =
    membersLoading ||
    teamByIdLoading ||
    teamsLoading ||
    userTeamLoading ||
    leagueLoading ||
    positionsLoading;

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

  if (loading) return <Spinner />;

  if (membersError) {
    const graphQLErrors =
      'graphQLErrors' in membersError
        ? (membersError.graphQLErrors as ReadonlyArray<{
            extensions?: Record<string, unknown>;
          }>)
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
  if (teamsError)
    return <Text>Error loading league teams: {teamsError.message}</Text>;
  if (userTeamError)
    return <Text>Error loading team ownership: {userTeamError.message}</Text>;
  if (leagueError)
    return <Text>Error loading league details: {leagueError.message}</Text>;

  // Find the team from leagueTeams, falling back to teamById for empty-roster teams
  const team =
    teamsData?.leagueTeams?.find(
      (t: { id?: number | null }) => t?.id === teamIdNum,
    ) ?? teamByIdData?.teamById;
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

  // ── Upload handler ─────────────────────────────────────────────────────────

  const handleFileUpload = async (
    file: File,
    imageType: 'avatar' | 'banner',
  ) => {
    if (!leagueId) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setBrandingError(
        `Unsupported file type: ${file.type}. Please upload a PNG, JPEG, or WebP image.`,
      );
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setBrandingError(
        `Image is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`,
      );
      return;
    }

    setBrandingError(null);
    setBrandingSuccess(false);

    if (imageType === 'avatar') setAvatarUploading(true);
    else setBannerUploading(true);

    try {
      if (!env.imageUploadUrl) {
        throw new Error(
          'Image uploads are not configured. Please set VITE_IMAGE_UPLOAD_URL.',
        );
      }
      const uploadUrl = `${env.imageUploadUrl}/images/upload?teamId=${teamIdNum}&imageType=${imageType}`;
      const csrfToken = getCsrfToken();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: file,
        credentials: 'include',
      });

      const json = (await response.json()) as { url?: string; error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? `Upload failed (${response.status})`);
      }

      if (!json.url) {
        throw new Error('Upload succeeded but no URL was returned');
      }

      await updateTeamBranding({
        variables: {
          teamId: teamIdNum,
          leagueId,
          ...(imageType === 'avatar'
            ? { avatarUrl: json.url }
            : { bannerUrl: json.url }),
        },
      });

      await refetchTeams();
      if (imageType === 'avatar') setAvatarImgError(false);
      else setBannerImgError(false);
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      if (imageType === 'avatar') setAvatarUploading(false);
      else setBannerUploading(false);
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
          {!isOwner && !isCommissioner && (
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

      {/* ── GM / Commissioner Settings ── */}
      {(isGM || isCommissioner) && leagueId && (
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
                Personalise your team with a logo and banner. Upload an image
                (PNG, JPEG, or WebP, max 2 MB) or paste a public HTTPS URL.
                Uploaded images are screened for inappropriate content.
              </Text>

              {/* Hidden file inputs */}
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file, 'avatar');
                  e.target.value = '';
                }}
              />
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file, 'banner');
                  e.target.value = '';
                }}
              />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (brandingLoading || (!avatarInput && !bannerInput)) return;
                  void handleSaveBranding();
                }}
                style={{ display: 'contents' }}
              >
                {/* Avatar */}
                <YStack gap="$2">
                  <Text fontSize="$3" fontWeight="500">
                    Avatar{' '}
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
                        onPress={() => setPendingClear('logo')}
                        disabled={brandingLoading || avatarUploading}
                        style={{ color: BRAND_SEAM_RED }}
                      >
                        Clear
                      </Button>
                    </XStack>
                  )}
                  <XStack gap="$2" alignItems="center">
                    <Input
                      value={avatarInput}
                      onChangeText={setAvatarInput}
                      placeholder="https://example.com/my-logo.png"
                      autoCapitalize="none"
                      autoCorrect={false}
                      flex={1}
                    />
                    <Button
                      size="$3"
                      onPress={() => avatarFileInputRef.current?.click()}
                      disabled={
                        avatarUploading || bannerUploading || brandingLoading
                      }
                      style={{
                        backgroundColor: BRAND_NAVY_LIGHT,
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {avatarUploading ? 'Uploading…' : 'Upload'}
                    </Button>
                  </XStack>
                </YStack>

                {/* Banner */}
                <YStack gap="$2">
                  <Text fontSize="$3" fontWeight="500">
                    Banner{' '}
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
                        onPress={() => setPendingClear('banner')}
                        disabled={brandingLoading || bannerUploading}
                        style={{ color: BRAND_SEAM_RED }}
                      >
                        Clear
                      </Button>
                    </XStack>
                  )}
                  <XStack gap="$2" alignItems="center">
                    <Input
                      value={bannerInput}
                      onChangeText={setBannerInput}
                      placeholder="https://example.com/my-banner.jpg"
                      autoCapitalize="none"
                      autoCorrect={false}
                      flex={1}
                    />
                    <Button
                      size="$3"
                      onPress={() => bannerFileInputRef.current?.click()}
                      disabled={
                        avatarUploading || bannerUploading || brandingLoading
                      }
                      style={{
                        backgroundColor: BRAND_NAVY_LIGHT,
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {bannerUploading ? 'Uploading…' : 'Upload'}
                    </Button>
                  </XStack>
                </YStack>

                {/* Feedback */}
                {brandingError && (
                  <Text fontSize="$3" style={{ color: BRAND_SEAM_RED }}>
                    {brandingError}
                  </Text>
                )}
                {brandingSuccess && (
                  <Text fontSize="$3" color="$green9">
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
              </form>
            </YStack>

            {/* Assistant Manager Settings */}
            <TeamAssistantManagerSettings
              teamId={teamIdNum}
              leagueId={leagueId}
            />
          </YStack>
        </>
      )}

      {/* Confirmation dialog for clearing logo / banner (LS-4017) */}
      <Dialog
        modal
        open={pendingClear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClear(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation="quick"
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-branding-title"
            aria-describedby="clear-branding-description"
            animateOnly={['transform', 'opacity']}
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={500}
          >
            <Dialog.Title id="clear-branding-title" color="$red11">
              {pendingClear === 'banner'
                ? 'Clear team banner?'
                : 'Clear team logo?'}
            </Dialog.Title>
            <Dialog.Description id="clear-branding-description">
              <Paragraph>
                {pendingClear === 'banner'
                  ? 'The current banner image will be removed from your team.'
                  : 'The current logo will be removed from your team.'}{' '}
                You can upload a new one at any time.
              </Paragraph>
            </Dialog.Description>
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                onPress={() => setPendingClear(null)}
                disabled={brandingLoading}
              >
                Cancel
              </Button>
              <Button
                theme="red"
                onPress={() => {
                  const target = pendingClear;
                  setPendingClear(null);
                  if (target === 'banner') void handleClearBanner();
                  else if (target === 'logo') void handleClearAvatar();
                }}
                disabled={brandingLoading}
                icon={brandingLoading ? <Spinner /> : undefined}
              >
                {pendingClear === 'banner' ? 'Clear banner' : 'Clear logo'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}
