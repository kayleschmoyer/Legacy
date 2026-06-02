import React, { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Button, H1, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { useInitializeMockDraftMutation } from '../../../api/db/graphql.generated';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

const BRAND_GOLD = '#B8962E';

type DraftOrder = 'snake' | 'linear';
type PlayerPool = 'all' | 'nl' | 'al';

const TEAM_OPTIONS = [4, 6, 8, 10, 12] as const;
const ROSTER_OPTIONS = [5, 8, 10, 15] as const;
const DRAFT_ORDER_OPTIONS: { label: string; value: DraftOrder }[] = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
];
const PLAYER_POOL_OPTIONS: { label: string; value: PlayerPool }[] = [
  { label: 'All MLB', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
];

// Pick-time limit mirrors the web Mock Draft Simulator (90s per pick).
const PICK_TIME_LIMIT_SECONDS = 90;

const MOCK_DRAFT_FEATURE_NAME = 'Mock Draft Simulator';

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Selectable chip used for each mock-draft setting. */
function OptionButton({
  label,
  selected,
  onPress,
}: OptionButtonProps): React.JSX.Element {
  return (
    <Button
      size="$3"
      onPress={onPress}
      minWidth={56}
      backgroundColor={selected ? '$orange9' : '$gray4'}
      borderWidth={1}
      borderColor={selected ? '$orange9' : '$gray6'}
      pressStyle={{ opacity: 0.85 }}
      aria-pressed={selected}
    >
      <Text
        color={selected ? 'white' : '$color'}
        fontSize="$4"
        fontWeight={selected ? '700' : '500'}
      >
        {label}
      </Text>
    </Button>
  );
}

interface SettingRowProps {
  label: string;
  children: React.ReactNode;
  helper?: string;
}

function SettingRow({
  label,
  children,
  helper,
}: SettingRowProps): React.JSX.Element {
  return (
    <YStack space="$2" marginBottom="$4">
      <Text
        color="$gray11"
        fontSize="$3"
        fontWeight="600"
        textTransform="uppercase"
      >
        {label}
      </Text>
      <XStack space="$2" flexWrap="wrap">
        {children}
      </XStack>
      {helper ? (
        <Text color="$gray10" fontSize="$2">
          {helper}
        </Text>
      ) : null}
    </YStack>
  );
}

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
 * Mock Draft Simulator screen for mobile (LS-5185). Mirrors the web
 * MockDraftPage settings and `initializeMockDraft` flow so free and premium
 * users can run a mock draft from the app. Free users see a Premium upsell CTA;
 * the 2/week limit is enforced server-side and surfaced via the mutation error.
 */
export function MockDraftPage(): React.JSX.Element {
  const router = useRouter();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();

  const [numTeams, setNumTeams] = useState(8);
  const [rosterSize, setRosterSize] = useState(10);
  const [userPickPosition, setUserPickPosition] = useState(1);
  const [draftOrder, setDraftOrder] = useState<DraftOrder>('snake');
  const [playerPool, setPlayerPool] = useState<PlayerPool>('all');
  const [missingLeagueIdError, setMissingLeagueIdError] = useState<
    string | null
  >(null);

  const handleStart = async () => {
    setMissingLeagueIdError(null);
    const result = await initializeMockDraft({
      variables: {
        numTeams,
        rosterSize,
        userPickPosition,
        pickTimeLimitSeconds: PICK_TIME_LIMIT_SECONDS,
        draftOrder,
        playerPool,
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

  const pickHelper =
    draftOrder === 'snake'
      ? userPickPosition === 1
        ? 'Snake draft — you pick first every odd round'
        : userPickPosition === numTeams
          ? 'Snake draft — you pick first every even round'
          : `Snake draft — you pick at position ${userPickPosition}`
      : `Linear draft — you pick at position ${userPickPosition} every round`;

  const errorMessage = error?.message ?? missingLeagueIdError;

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

        {/* Premium upsell — only for free users; mock drafts remain available
            with a server-enforced 2/week limit on the free plan. */}
        {!subscriptionLoading && !isPremium ? <PremiumUpsell /> : null}

        <SettingRow label="Number of Teams">
          {TEAM_OPTIONS.map((n) => (
            <OptionButton
              key={n}
              label={String(n)}
              selected={numTeams === n}
              onPress={() => {
                setNumTeams(n);
                if (userPickPosition > n) setUserPickPosition(n);
              }}
            />
          ))}
        </SettingRow>

        <SettingRow label="Rounds (Roster Size)">
          {ROSTER_OPTIONS.map((n) => (
            <OptionButton
              key={n}
              label={String(n)}
              selected={rosterSize === n}
              onPress={() => setRosterSize(n)}
            />
          ))}
        </SettingRow>

        <SettingRow label="Your Draft Position" helper={pickHelper}>
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((pos) => (
            <OptionButton
              key={pos}
              label={String(pos)}
              selected={userPickPosition === pos}
              onPress={() => setUserPickPosition(pos)}
            />
          ))}
        </SettingRow>

        <SettingRow label="Draft Order">
          {DRAFT_ORDER_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={draftOrder === opt.value}
              onPress={() => setDraftOrder(opt.value)}
            />
          ))}
        </SettingRow>

        <SettingRow label="Player Pool">
          {PLAYER_POOL_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={playerPool === opt.value}
              onPress={() => setPlayerPool(opt.value)}
            />
          ))}
        </SettingRow>

        {errorMessage ? (
          <YStack
            backgroundColor="$red2"
            borderColor="$red8"
            borderWidth={1}
            borderRadius="$3"
            padding="$3"
            marginBottom="$3"
          >
            <Text color="$red10" fontSize="$3">
              {errorMessage}
            </Text>
          </YStack>
        ) : null}

        <XStack space="$3" marginTop="$2">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            disabled={loading}
            opacity={loading ? 0.6 : 1}
            onPress={() => {
              void handleStart();
            }}
            pressStyle={{ opacity: 0.85 }}
          >
            {loading ? (
              <XStack space="$2" alignItems="center">
                <Spinner color="white" />
                <Text color="white" fontWeight="bold">
                  Starting…
                </Text>
              </XStack>
            ) : (
              <Text color="white" fontSize="$5" fontWeight="bold">
                Start Mock Draft
              </Text>
            )}
          </Button>
          <Button
            backgroundColor="$gray8"
            borderRadius="$3"
            onPress={() => router.navigate('/baseball')}
            pressStyle={{ opacity: 0.85 }}
          >
            <Text color="white" fontSize="$5">
              Cancel
            </Text>
          </Button>
        </XStack>

        <Text color="$gray10" fontSize="$2" marginTop="$3" textAlign="center">
          Mock drafts don't affect any real leagues • AI opponents use ADP-based
          strategy
        </Text>
      </YStack>
    </ScrollView>
  );
}

export default MockDraftPage;
