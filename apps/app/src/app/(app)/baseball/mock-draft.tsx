import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useFeatureIsOn } from '@growthbook/growthbook-react';
import { Lock } from '@tamagui/lucide-icons';
import { Button, H1, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  type MockDraftSettings,
  MockDraftSetup,
} from '@legacy-sports/shared-components/draft';
import {
  useGetMyMockDraftUsageQuery,
  useInitializeMockDraftMutation,
} from '@legacy-sports/graphql';
import { brand } from '@legacy-sports/design-tokens';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';
import { closeToHomeTab } from '../../../common/utilities/RouteUtils';

/**
 * GrowthBook flag key that gates the football sport option (ADR 0011 §4,
 * LS-4666). Mirrors web's `FOOTBALL_MOCK_PLAYERS_FLAG`; when off, only
 * baseball is offered.
 */
const FOOTBALL_MOCK_PLAYERS_FLAG = 'football-mock-players';

// Pick-time limit mirrors the web Mock Draft Simulator (90s per pick).
const PICK_TIME_LIMIT_SECONDS = 90;

const MOCK_DRAFT_FEATURE_NAME = 'Mock Draft Simulator';

/**
 * Upsell shown to free users. Mock drafts are available on the free plan with
 * a 2-per-week limit (enforced server-side by `initializeMockDraft`); this CTA
 * promotes the Premium plan's unlimited drafts. Unlike a hard PremiumGate it
 * does not block the form — free users can still start a draft.
 */
function PremiumUpsell(): React.JSX.Element {
  const router = useRouter();

  const onUpgrade = () => {
    trackPremiumFeatureClick(MOCK_DRAFT_FEATURE_NAME);
    void router.navigate('subscription-settings');
  };

  return (
    <YStack
      backgroundColor="$gray2"
      borderRadius="$4"
      borderWidth={1}
      borderColor={`${brand.gold}73`}
      padding="$4"
      space="$2"
      marginBottom="$5"
    >
      <Text color={brand.gold} fontSize="$5" fontWeight="bold">
        Free plan: 2 mock drafts per week
      </Text>
      <Text color="$gray11" fontSize="$3">
        Upgrade to Premium for unlimited mock drafts and uninterrupted draft
        practice.
      </Text>
      <Button
        backgroundColor={brand.gold}
        borderRadius="$4"
        marginTop="$2"
        onPress={onUpgrade}
        pressStyle={{ opacity: 0.85 }}
      >
        <Text color="$background" fontWeight="bold">
          Upgrade to Premium
        </Text>
      </Button>
    </YStack>
  );
}

/**
 * Shown to free-tier users who have exhausted their weekly mock draft allowance
 * (LS-5020). Mirrors the web's LimitReachedScreen: blocks the form and surfaces
 * an upgrade path rather than letting users submit only to get a server error.
 */
function LimitReachedScreen({
  used,
  limit,
}: {
  used: number;
  limit: number;
}): React.JSX.Element {
  const router = useRouter();

  const onUpgrade = () => {
    trackPremiumFeatureClick(MOCK_DRAFT_FEATURE_NAME);
    void router.navigate('subscription-settings');
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$3"
        alignItems="center"
        justifyContent="center"
      >
        <YStack
          testID="mock-draft-limit-reached"
          backgroundColor="$gray2"
          borderRadius="$4"
          borderWidth={1}
          borderColor={`${brand.gold}73`}
          padding="$5"
          space="$4"
          width="100%"
          maxWidth={480}
          alignItems="center"
        >
          <Lock size={32} color={brand.gold} />
          <YStack space="$1" alignItems="center">
            <Text
              color={brand.gold}
              fontSize="$6"
              fontWeight="bold"
              textAlign="center"
            >
              Weekly Limit Reached
            </Text>
            <Text color="$gray11" fontSize="$3" textAlign="center">
              {used} of {limit} free mock drafts used this week
            </Text>
          </YStack>
          <Text color="$gray11" fontSize="$3" textAlign="center">
            Upgrade to Premium for unlimited mock drafts and uninterrupted draft
            practice.
          </Text>
          <XStack space="$3" width="100%">
            <Button
              flex={1}
              backgroundColor={brand.gold}
              borderRadius="$4"
              onPress={onUpgrade}
              pressStyle={{ opacity: 0.85 }}
            >
              <Text color="$background" fontWeight="bold">
                Upgrade to Premium
              </Text>
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

/**
 * Mock Draft Simulator screen for mobile (LS-5185). Renders the shared
 * {@link MockDraftSetup} settings form (LS-7711) so web and native stay in
 * sync, wrapping it in native chrome: the page header, the Premium upsell for
 * free users (server-enforced 2/week limit, surfaced via the mutation error),
 * and the `initializeMockDraft` flow that launches the live draft board.
 */
export function MockDraftPage(): React.JSX.Element {
  const router = useRouter();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const footballMockEnabled = useFeatureIsOn(FOOTBALL_MOCK_PLAYERS_FLAG);
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();
  const [missingLeagueIdError, setMissingLeagueIdError] = useState<
    string | null
  >(null);

  // Weekly free-tier usage, mirroring web's usage label. `cache-and-network`
  // keeps the count fresh when the user returns to start another draft.
  const { data: usageData } = useGetMyMockDraftUsageQuery({
    fetchPolicy: 'cache-and-network',
  });
  const usage = usageData?.getMyMockDraftUsage;
  const usageLabel =
    usage != null &&
    usage.isUnlimited !== true &&
    usage.used != null &&
    usage.limit != null
      ? `${usage.used} of ${usage.limit} free mock drafts used this week`
      : undefined;

  const handleStart = async (settings: MockDraftSettings) => {
    // Football mock draft is preview-only until the sport-aware engine ships
    // (LS-4657 → LS-4665); the shared form keeps Start disabled, but guard here
    // too so the mutation is never fired for football.
    if (settings.sport === 'football') return;
    setMissingLeagueIdError(null);
    const result = await initializeMockDraft({
      variables: {
        numTeams: settings.numTeams,
        rosterSize: settings.rosterSize,
        userPickPosition: settings.userPickPosition,
        pickTimeLimitSeconds: PICK_TIME_LIMIT_SECONDS,
        draftOrder: settings.draftOrder,
        playerPool: settings.playerPool,
      },
    });
    const leagueId = result.data?.initializeMockDraft?.leagueId;
    if (leagueId != null) {
      router.navigate({
        pathname: '/DraftBoardPage',
        params: { leagueId: String(leagueId) },
      });
    } else {
      setMissingLeagueIdError("Couldn't start mock draft — please try again.");
    }
  };

  // Free-tier users who have exhausted their weekly allowance see a blocking
  // limit-reached screen instead of a form that would fail on submit (LS-5020).
  // Mirrors web's LimitReachedScreen logic. Fails open when usage is unavailable
  // so the server-side cap still applies on the rare network-error path.
  const limitReached =
    usage != null &&
    usage.isUnlimited !== true &&
    usage.used != null &&
    usage.limit != null &&
    usage.remaining != null &&
    usage.remaining <= 0;

  if (limitReached) {
    return (
      <LimitReachedScreen
        used={usage.used as number}
        limit={usage.limit as number}
      />
    );
  }

  const errorMessage = error?.message ?? missingLeagueIdError;
  const showUpsell = !subscriptionLoading && !isPremium;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$3"
      >
        <YStack space="$2" marginBottom="$3">
          <H1 color="$orange9" fontSize="$9" fontWeight="bold">
            Mock Draft Simulator
          </H1>
          <Text color="$gray11" fontSize="$4">
            Practice your draft strategy against AI opponents without affecting
            any real league.
          </Text>
        </YStack>

        <MockDraftSetup
          onStart={(s) => {
            void handleStart(s);
          }}
          // Returns to whichever surface launched the mock draft rather than
          // pushing the standalone `/baseball` home (LS-8823).
          onCancel={() => closeToHomeTab(router)}
          loading={loading}
          error={errorMessage}
          footballMockEnabled={footballMockEnabled}
          usageLabel={usageLabel}
          header={showUpsell ? <PremiumUpsell /> : null}
        />

        <Text color="$gray10" fontSize="$2" marginTop="$3" textAlign="center">
          Mock drafts don't affect any real leagues • AI opponents use ADP-based
          strategy
        </Text>
      </YStack>
    </ScrollView>
  );
}

export default MockDraftPage;

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
