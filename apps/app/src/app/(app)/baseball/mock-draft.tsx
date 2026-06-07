import React, { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Button, H1, ScrollView, Text, YStack } from 'tamagui';
import {
  type MockDraftSettings,
  MockDraftSetup,
} from '@legacy-sports/shared-components/draft';
import { useInitializeMockDraftMutation } from '../../../api/db/graphql.generated';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

const BRAND_GOLD = '#B8962E';

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
      borderColor={`${BRAND_GOLD}73`}
      padding="$4"
      space="$2"
      marginBottom="$5"
    >
      <Text color={BRAND_GOLD} fontSize="$5" fontWeight="bold">
        Free plan: 2 mock drafts per week
      </Text>
      <Text color="$gray11" fontSize="$3">
        Upgrade to Premium for unlimited mock drafts and uninterrupted draft
        practice.
      </Text>
      <Button
        backgroundColor={BRAND_GOLD}
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
 * Mock Draft Simulator screen for mobile (LS-5185). Renders the shared
 * {@link MockDraftSetup} settings form (LS-7711) so web and native stay in
 * sync, wrapping it in native chrome: the page header, the Premium upsell for
 * free users (server-enforced 2/week limit, surfaced via the mutation error),
 * and the `initializeMockDraft` flow that launches the live draft board.
 */
export function MockDraftPage(): React.JSX.Element {
  const router = useRouter();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();
  const [missingLeagueIdError, setMissingLeagueIdError] = useState<
    string | null
  >(null);

  const handleStart = async (settings: MockDraftSettings) => {
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
      } as Href);
    } else {
      setMissingLeagueIdError("Couldn't start mock draft — please try again.");
    }
  };

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
          onCancel={() => router.navigate('/baseball')}
          loading={loading}
          error={errorMessage}
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
