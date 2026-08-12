import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Text } from 'tamagui';
import {
  Button,
  H1,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { Skeleton } from '@legacy-sports/shared-components';
import {
  MockDraftInviteCard,
  type MockDraftSettings,
  MockDraftSetup,
} from '@legacy-sports/shared-components/draft';
import { Lock } from '@tamagui/lucide-icons';
import {
  useGetMyMockDraftUsageQuery,
  useInitializeMockDraftMutation,
} from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { UpgradeModal } from '../../components/UpgradeModal';
import { PageMeta } from '../../components/PageMeta';
import { useFeatureIsOn } from '../../context/GrowthBookProvider';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import {
  BLACK,
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GRADIENT_BOARD_BG,
  OVERLAY_WHITE_10,
  SURFACE_CARD,
  withAlpha,
} from '../../constants/colors';

/**
 * GrowthBook flag key that gates the football sport option on this page
 * (ADR 0011 §4, LS-4666). When off, the page behaves exactly as before.
 */
export const FOOTBALL_MOCK_PLAYERS_FLAG = 'football-mock-players';

// ─── Setup Screen ─────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onStart: (settings: MockDraftSettings) => void;
  loading?: boolean;
  error?: string | null;
  /** When true, the Sport selector exposes a Football option (LS-4666). */
  footballMockEnabled?: boolean;
  /** Prefill values from URL query params (e.g. when launched from a real league row). */
  initialNumTeams?: number;
  initialDraftOrder?: MockDraftSettings['draftOrder'];
  /**
   * Optional weekly-usage helper shown above the actions for free-tier users
   * (e.g. "1 of 2 free mock drafts used this week"). Omitted for unlimited
   * users (LS-5178).
   */
  usageLabel?: string;
  /** Navigates to the join-by-code screen when Shared mode is selected. */
  onJoinInstead?: () => void;
  /** Whether the current user's plan grants Control All Teams (LS-9253). */
  isControlAllTeamsEntitled: boolean;
}

/**
 * Web Mock Draft setup screen: brand chrome (gradient background, "Practice
 * Mode" card) wrapping the shared {@link MockDraftSetup} form (LS-7711). The
 * interactive settings live in shared-components so web and native render the
 * same battle-tested form; web owns the surrounding presentation, premium
 * gating, navigation, and the `initializeMockDraft` wiring.
 */
function SetupScreen({
  onStart,
  loading = false,
  error = null,
  footballMockEnabled = false,
  initialNumTeams,
  initialDraftOrder,
  usageLabel,
  onJoinInstead,
  isControlAllTeamsEntitled,
}: SetupScreenProps): React.JSX.Element {
  const navigate = useNavigate();
  const [showControlAllTeamsUpgrade, setShowControlAllTeamsUpgrade] =
    React.useState(false);

  return (
    <YStack
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      style={{ background: GRADIENT_BOARD_BG }}
    >
      <YStack width="100%" maxWidth={560}>
        {/* Header */}
        <YStack alignItems="center" gap="$3" marginBottom="$7">
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius={9999}
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
          >
            <span role="img" aria-label="Baseball" style={{ fontSize: 14 }}>
              ⚾
            </span>
            <Text
              fontFamily="$display"
              fontSize={12}
              fontWeight="700"
              color={BRAND_SEAM_RED}
              textTransform="uppercase"
              letterSpacing={1.5}
            >
              Practice Mode
            </Text>
          </XStack>
          <H1
            fontFamily="$display"
            fontSize={40}
            fontWeight="800"
            color={BRAND_GOLD}
            letterSpacing={-0.5}
            textAlign="center"
            margin={0}
          >
            Mock Draft Simulator
          </H1>
          <Paragraph
            fontFamily="$body"
            fontSize={16}
            color="$gray11"
            textAlign="center"
            margin={0}
            maxWidth={460}
          >
            Practice your draft strategy against AI opponents without affecting
            any real league.
          </Paragraph>
        </YStack>

        {/* Settings Card */}
        <YStack
          backgroundColor={SURFACE_CARD}
          borderRadius="$6"
          padding="$6"
          borderWidth={1}
          borderColor={OVERLAY_WHITE_10}
          style={{ boxShadow: `0 16px 64px ${withAlpha(BLACK, 0.4)}` }}
        >
          <MockDraftSetup
            onStart={onStart}
            onCancel={() => navigate('/baseball')}
            loading={loading}
            error={error}
            footballMockEnabled={footballMockEnabled}
            initialNumTeams={initialNumTeams}
            initialDraftOrder={initialDraftOrder}
            usageLabel={usageLabel}
            onJoinInstead={onJoinInstead}
            isControlAllTeamsEntitled={isControlAllTeamsEntitled}
            onControlAllTeamsUpgrade={() => setShowControlAllTeamsUpgrade(true)}
          />
        </YStack>

        {/* Info line */}
        <Paragraph
          fontFamily="$body"
          fontSize={12}
          color="$gray10"
          textAlign="center"
          marginTop="$4"
          margin={0}
        >
          Mock drafts don't affect any real leagues • AI opponents use ADP-based
          strategy
        </Paragraph>
      </YStack>

      <UpgradeModal
        open={showControlAllTeamsUpgrade}
        onOpenChange={setShowControlAllTeamsUpgrade}
        featureName="Control All Teams"
        featureDescription="Upgrade to Premium to make every pick for every team in a mock draft."
      />
    </YStack>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

/**
 * Placeholder shown while premium status is still resolving (LS-5195).
 *
 * Premium users would otherwise see a 200-500ms flash of the PremiumGate lock
 * overlay because `useIsPremiumStatus` reports `isPremium=false` until the user
 * record loads. We render this neutral skeleton (mirroring the SetupScreen's
 * centered card layout) until `isLoading` resolves, then render either the
 * setup screen or the gate based on the confirmed status.
 */
function MockDraftSkeleton(): React.JSX.Element {
  return (
    <YStack
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      style={{ background: GRADIENT_BOARD_BG }}
    >
      <YStack width="100%" maxWidth={560} gap="$7">
        {/* Header placeholder */}
        <YStack alignItems="center" gap="$3">
          <Skeleton width={120} height={24} radius={9999} />
          <Skeleton width={320} height={40} />
          <Skeleton width={420} height={16} />
        </YStack>
        {/* Settings card placeholder */}
        <YStack gap="$4">
          <Skeleton width="100%" height={64} radius={12} />
          <Skeleton width="100%" height={64} radius={12} />
          <Skeleton width="100%" height={48} radius={12} />
        </YStack>
      </YStack>
    </YStack>
  );
}

// ─── Limit Reached Screen ──────────────────────────────────────────────────

interface LimitReachedScreenProps {
  /** Mock drafts the user has created in the trailing 7-day window. */
  used: number;
  /** Free-tier weekly mock-draft cap. */
  limit: number;
}

/**
 * Disabled state shown to free-tier users who have exhausted their weekly mock
 * drafts (LS-5178). Previously these users saw the full setup form and only
 * discovered the limit when `initializeMockDraft` failed with PREMIUM_REQUIRED;
 * now the limit is reflected up front with an upgrade path.
 */
function LimitReachedScreen({
  used,
  limit,
}: LimitReachedScreenProps): React.JSX.Element {
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);

  return (
    <YStack
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      style={{ background: GRADIENT_BOARD_BG }}
    >
      <YStack width="100%" maxWidth={560}>
        {/* Header — mirrors the setup screen so the page reads consistently */}
        <YStack alignItems="center" gap="$3" marginBottom="$7">
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius={9999}
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
          >
            <span role="img" aria-label="Baseball" style={{ fontSize: 14 }}>
              ⚾
            </span>
            <Text
              fontFamily="$display"
              fontSize={12}
              fontWeight="700"
              color={BRAND_SEAM_RED}
              textTransform="uppercase"
              letterSpacing={1.5}
            >
              Practice Mode
            </Text>
          </XStack>
          <H1
            fontFamily="$display"
            fontSize={40}
            fontWeight="800"
            color={BRAND_GOLD}
            letterSpacing={-0.5}
            textAlign="center"
            margin={0}
          >
            Mock Draft Simulator
          </H1>
        </YStack>

        {/* Limit card */}
        <YStack
          data-testid="mock-draft-limit-reached"
          backgroundColor={SURFACE_CARD}
          borderRadius="$6"
          padding="$6"
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.45)}
          alignItems="center"
          gap="$4"
          style={{ boxShadow: `0 16px 64px ${withAlpha(BLACK, 0.4)}` }}
        >
          <Lock size={32} color={BRAND_GOLD} />
          <YStack alignItems="center" gap="$2">
            <Text
              fontFamily="$display"
              fontSize={22}
              fontWeight="700"
              color={BRAND_GOLD}
              textAlign="center"
            >
              {used}/{limit} mock drafts used this week
            </Text>
            <Paragraph
              fontFamily="$body"
              fontSize={15}
              color="$gray11"
              textAlign="center"
              margin={0}
              maxWidth={420}
            >
              You've used all {limit} of your free mock drafts this week.
              Upgrade to Premium for unlimited mock drafts, or check back next
              week.
            </Paragraph>
          </YStack>

          <XStack gap="$3" marginTop="$2" width="100%">
            <Button
              size="$5"
              variant="primary"
              onPress={() => setShowUpgradeModal(true)}
              flex={1}
              backgroundColor={BRAND_GOLD}
              borderColor={BRAND_GOLD}
              pressStyle={{ scale: 0.98 }}
            >
              <Text
                fontFamily="$display"
                fontSize={16}
                fontWeight="700"
                color={BLACK}
                letterSpacing={0.5}
              >
                Upgrade to Premium
              </Text>
            </Button>
            <Button
              size="$5"
              variant="outlined"
              onPress={() => navigate('/baseball')}
              backgroundColor="transparent"
              borderColor={BRAND_NAVY_LIGHT}
              hoverStyle={{ backgroundColor: '$color3' }}
            >
              <Text fontFamily="$body" fontSize={15} color="$gray11">
                Back
              </Text>
            </Button>
          </XStack>
        </YStack>
      </YStack>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        featureName="Mock Draft Simulator"
        featureDescription="Upgrade to Premium for unlimited mock drafts."
      />
    </YStack>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function MockDraftPage(): React.JSX.Element {
  const navigate = useNavigate();
  const footballMockEnabled = useFeatureIsOn(FOOTBALL_MOCK_PLAYERS_FLAG);
  const isControlAllTeamsEntitled = useHasEntitlement(
    ENTITLEMENTS.mock_draft_control_all_teams,
  );
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();
  const [missingLeagueIdError, setMissingLeagueIdError] = React.useState<
    string | null
  >(null);
  // Shared-mode drafts pause here to let the creator share the invite code
  // before entering the draft room lobby (LS-9181). Offline drafts navigate
  // straight through, unchanged.
  const [pendingInvite, setPendingInvite] = React.useState<{
    leagueId: number;
    inviteCode: string;
    sport: MockDraftSettings['sport'];
  } | null>(null);

  // Gate the page on remaining weekly allowance rather than subscription tier:
  // free users get a fixed number of mock drafts per week, so blocking the form
  // purely on `isPremium` either hid the form from users who still had drafts
  // left or let exhausted users submit only to hit a PREMIUM_REQUIRED error
  // (LS-5178). `cache-and-network` keeps the count fresh when the user returns
  // via the draft board's "Practice Again" CTA.
  const { data: usageData, loading: usageLoading } =
    useGetMyMockDraftUsageQuery({ fetchPolicy: 'cache-and-network' });
  const usage = usageData?.getMyMockDraftUsage;

  // Prefill setup from query params when launched from a pre-draft league row
  // on the homepage. Only the first render matters — these are seed values.
  const [searchParams] = useSearchParams();
  const teamsParam = Number(searchParams.get('teams'));
  const initialNumTeams =
    Number.isFinite(teamsParam) && teamsParam > 0 ? teamsParam : undefined;
  const orderParam = searchParams.get('draftOrder');
  const initialDraftOrder: MockDraftSettings['draftOrder'] | undefined =
    orderParam === 'linear' || orderParam === 'snake' ? orderParam : undefined;

  const handleStart = async (s: MockDraftSettings) => {
    setMissingLeagueIdError(null);
    // Control All Teams always implies offline (LS-9253) — the server forces
    // this too, but computing it client-side keeps pickTimeLimitSeconds correct.
    const isOffline = s.mode === 'offline' || s.controlAllTeams === true;
    const result = await initializeMockDraft({
      variables: {
        numTeams: s.numTeams,
        rosterSize: s.rosterSize,
        userPickPosition: s.userPickPosition,
        // Offline mode ignores this and uses its own untimed sentinel server-side.
        pickTimeLimitSeconds: isOffline ? undefined : 90,
        draftOrder: s.draftOrder,
        playerPool: s.playerPool,
        sport: s.sport,
        isOffline,
        controlAllTeams: s.controlAllTeams,
      },
    });
    const initialized = result.data?.initializeMockDraft;
    const leagueId = initialized?.leagueId;
    if (!leagueId) {
      setMissingLeagueIdError("Couldn't start mock draft — please try again.");
      return;
    }
    if (!isOffline && initialized.inviteCode) {
      // Pause on the invite screen instead of navigating straight into the
      // draft room lobby (LS-9181).
      setPendingInvite({
        leagueId,
        inviteCode: initialized.inviteCode,
        sport: s.sport,
      });
      return;
    }
    navigate(`/${s.sport}/league/${leagueId}/draft`);
  };

  // Render a neutral skeleton while the usage query resolves on first load so
  // the form/limit state doesn't flash before we know the user's allowance.
  if (usageLoading && !usage) {
    return <MockDraftSkeleton />;
  }

  // Free-tier users who have exhausted their weekly allowance see a disabled
  // limit-reached state instead of a form that would fail on submit. Unlimited
  // users (premium / admin) are never gated. Usage fields are nullable in the
  // schema, so we only gate when all the values we need are known — on a
  // usage-query error (or null fields) we fail open to the form, since the
  // mutation still enforces the cap server-side.
  if (
    usage != null &&
    usage.isUnlimited !== true &&
    usage.used != null &&
    usage.limit != null &&
    usage.remaining != null &&
    usage.remaining <= 0
  ) {
    return <LimitReachedScreen used={usage.used} limit={usage.limit} />;
  }

  const usageLabel =
    usage != null &&
    usage.isUnlimited !== true &&
    usage.used != null &&
    usage.limit != null
      ? `${usage.used} of ${usage.limit} free mock drafts used this week`
      : undefined;

  if (pendingInvite) {
    return (
      <YStack
        minHeight="100vh"
        alignItems="center"
        justifyContent="center"
        padding="$5"
        style={{ background: GRADIENT_BOARD_BG }}
      >
        <YStack
          width="100%"
          maxWidth={480}
          backgroundColor={SURFACE_CARD}
          borderRadius="$6"
          padding="$6"
          borderWidth={1}
          borderColor={OVERLAY_WHITE_10}
          style={{ boxShadow: `0 16px 64px ${withAlpha(BLACK, 0.4)}` }}
        >
          <MockDraftInviteCard
            inviteCode={pendingInvite.inviteCode}
            onContinue={() =>
              navigate(
                `/${pendingInvite.sport}/league/${pendingInvite.leagueId}/draft`,
              )
            }
          />
        </YStack>
      </YStack>
    );
  }

  return (
    <>
      <PageMeta
        title="Mock Draft Simulator"
        description="Practice your fantasy baseball draft strategy risk-free with the full Mock Draft simulator."
      />
      <SetupScreen
        onStart={(s) => {
          void handleStart(s);
        }}
        loading={loading}
        error={error?.message ?? missingLeagueIdError}
        footballMockEnabled={footballMockEnabled}
        initialNumTeams={initialNumTeams}
        initialDraftOrder={initialDraftOrder}
        usageLabel={usageLabel}
        onJoinInstead={() => navigate('/baseball/mock-draft/join')}
        isControlAllTeamsEntitled={isControlAllTeamsEntitled}
      />
    </>
  );
}
