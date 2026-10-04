import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Text } from 'tamagui';
import {
  Button,
  H1,
  Paragraph,
  Skeleton,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import {
  MockDraftInviteCard,
  type MockDraftSettings,
  MockDraftSetup,
} from '@legacy-sports/shared-components/draft';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import {
  MockDraftMode,
  Sport,
  useCreateMockDraftMutation,
  useGetMyMockDraftUsageQuery,
} from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { UpgradeModal } from '../../components/UpgradeModal';
import { PageMeta } from '../../components/PageMeta';
import { ResumeMockDraftBanner } from '../../components/ResumeMockDraftBanner';
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
  /** When true, the Sport selector exposes a Football option (LS-9470). */
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
  /** Sport currently selected in the form — drives the page chrome (LS-9470). */
  sport: MockDraftSettings['sport'];
  /** Called when the form's Sport selection changes. */
  onSportChange: (sport: MockDraftSettings['sport']) => void;
}

/** Page chrome that follows the selected sport (badge, copy, exit route). */
const SPORT_CHROME: Record<
  MockDraftSettings['sport'],
  {
    emoji: string;
    label: string;
    accent: string;
    blurb: string;
    homePath: string;
  }
> = {
  baseball: {
    emoji: '⚾',
    label: 'Baseball',
    accent: BRAND_SEAM_RED,
    blurb:
      'Practice your draft strategy against AI opponents without affecting any real league.',
    homePath: '/baseball',
  },
  football: {
    emoji: '🏈',
    label: 'Football',
    accent: BRAND_GOLD,
    blurb:
      'Practice your football draft strategy against AI opponents without affecting any real league.',
    homePath: '/football',
  },
};

/**
 * Web Mock Draft setup screen: brand chrome (gradient background, "Practice
 * Mode" card) wrapping the shared {@link MockDraftSetup} form (LS-7711). The
 * interactive settings live in shared-components so web and native render the
 * same battle-tested form; web owns the surrounding presentation, premium
 * gating, navigation, and the `createMockDraft` wiring.
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
  sport,
  onSportChange,
}: SetupScreenProps): React.JSX.Element {
  const navigate = useNavigate();
  const [showControlAllTeamsUpgrade, setShowControlAllTeamsUpgrade] =
    React.useState(false);
  const chrome = SPORT_CHROME[sport];

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
            backgroundColor={withAlpha(chrome.accent, 0.15)}
            borderWidth={1}
            borderColor={withAlpha(chrome.accent, 0.3)}
          >
            <span role="img" aria-label={chrome.label} style={{ fontSize: 14 }}>
              {chrome.emoji}
            </span>
            <Text
              fontFamily="$display"
              fontSize={12}
              fontWeight="700"
              color={chrome.accent}
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
            {chrome.blurb}
          </Paragraph>
        </YStack>

        {/* Unfinished drafts to get back into (LS-10465) */}
        <ResumeMockDraftBanner marginBottom="$4" />

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
            onCancel={() => navigate(chrome.homePath)}
            loading={loading}
            error={error}
            footballMockEnabled={footballMockEnabled}
            onSportChange={onSportChange}
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
 * discovered the limit when `createMockDraft` failed with PREMIUM_REQUIRED;
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

        {/* Unfinished drafts to get back into (LS-10465) */}
        <ResumeMockDraftBanner marginBottom="$4" />

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
  const [createMockDraft, { loading, error }] = useCreateMockDraftMutation();
  const [missingDraftIdError, setMissingDraftIdError] = React.useState<
    string | null
  >(null);
  // Mirrors the shared form's own Sport state so the page chrome (badge, copy,
  // Cancel destination) tracks it. The form stays the source of truth — this
  // is a read-only reflection updated via onSportChange.
  const [sport, setSport] =
    React.useState<MockDraftSettings['sport']>('baseball');
  // Shared-mode drafts pause here to let the creator share the invite code
  // before entering the draft room lobby (LS-9181). Offline drafts navigate
  // straight through, unchanged.
  const [pendingInvite, setPendingInvite] = React.useState<{
    draftId: number;
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
    setMissingDraftIdError(null);
    // Control All Teams always implies offline (LS-9253) — the server forces
    // this too, but computing it client-side keeps pickTimeLimitSeconds correct.
    const isOffline = s.mode === 'offline' || s.controlAllTeams === true;
    const result = await createMockDraft({
      variables: {
        numTeams: s.numTeams,
        // rosterSize is deliberately omitted (LS-10086) — mock drafts always
        // run the sport's full default roster, derived server-side.
        pickPosition: s.userPickPosition,
        // Offline mode ignores this and uses its own untimed sentinel server-side.
        pickTimeLimitSeconds: isOffline ? undefined : s.pickTimeLimitSeconds,
        draftOrder: s.draftOrder,
        playerPool: s.playerPool,
        sport: s.sport === 'football' ? Sport.Football : Sport.Baseball,
        mode: isOffline ? MockDraftMode.Offline : MockDraftMode.Online,
        controlAllTeams: s.controlAllTeams,
        isPublic: s.isPublic,
      },
    });
    const created = result.data?.createMockDraft;
    const draftId = created?.draftId;
    if (!draftId) {
      setMissingDraftIdError("Couldn't start mock draft — please try again.");
      return;
    }
    if (!isOffline && created.inviteCode) {
      // Pause on the invite screen instead of navigating straight into the
      // lobby (LS-9181), so the creator can share the code first.
      setPendingInvite({
        draftId,
        inviteCode: created.inviteCode,
        sport: s.sport,
      });
      return;
    }
    // A mock draft has no league, so it has its own route (LS-10076).
    navigate(`/${s.sport}/mock-draft/${String(draftId)}`);
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
                `/${pendingInvite.sport}/mock-draft/${String(pendingInvite.draftId)}`,
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
        description="Practice your fantasy baseball or football draft strategy risk-free with the full Mock Draft simulator."
      />
      <SetupScreen
        onStart={(s) => {
          void handleStart(s);
        }}
        loading={loading}
        error={error?.message ?? missingDraftIdError}
        footballMockEnabled={footballMockEnabled}
        initialNumTeams={initialNumTeams}
        initialDraftOrder={initialDraftOrder}
        usageLabel={usageLabel}
        onJoinInstead={() => navigate('/baseball/mock-draft/join')}
        isControlAllTeamsEntitled={isControlAllTeamsEntitled}
        sport={sport}
        onSportChange={setSport}
      />
    </>
  );
}
