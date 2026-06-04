import React, { useCallback, useState } from 'react';
import { ImageBackground, Modal, Share } from 'react-native';
import { Link, useRouter } from 'expo-router';
import {
  Button,
  H1,
  H2,
  H3,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import CreateLeagueModal from '../../../features/leagues/CreateLeagueModal';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { useGetUserLeaguesQuery } from '../../../api/db/graphql.generated';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { FREE_TIER_LEAGUE_LIMIT } from '../../../features/subscription/constants';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

const APP_BASE_URL = config.appBaseUrl ?? 'https://legacysports.app';

// Brand gold used for the free-tier upgrade prompt, matching the Mock Draft
// upsell and PremiumGate (LS-5182).
const BRAND_GOLD = '#B8962E';

// Analytics label for the upgrade prompt fired from the league-cap indicator.
const LEAGUE_CAP_FEATURE_NAME = 'Unlimited Leagues';

export default function BaseballHome() {
  const [modalVisible, setModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const { data, loading: loadingLeagues } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !userInfo?.id,
  });

  const { isPremium, loading: subscriptionLoading } = useSubscription();

  const openDraftModal = () => setModalVisible(true);

  const goToUpgrade = useCallback(() => {
    trackPremiumFeatureClick(LEAGUE_CAP_FEATURE_NAME);
    router.navigate('subscription-settings');
  }, [router]);

  const openInviteModal = () => setInviteModalVisible(true);
  const closeInviteModal = () => setInviteModalVisible(false);

  // Share the league's invite link via the native share sheet so the
  // recipient can join with the league's invite code (LS-5203).
  const shareLeagueInvite = useCallback(
    async (league: { name?: string | null; inviteCode?: string | null }) => {
      const leagueName = league.name ?? 'Legacy Sports League';
      const inviteCode = league.inviteCode ?? '';

      // Without an invite code there is no usable join link, so sharing would
      // produce an invite no one can act on — bail out rather than mislead.
      if (!inviteCode) {
        LOGGER.warn('Cannot share league invite — league has no invite code', {
          leagueName,
        });
        return;
      }

      const inviteUrl = `${APP_BASE_URL}/baseball/league/join/${inviteCode}`;
      const message = `Join my league "${leagueName}" on Legacy Sports!\n\n${inviteUrl}`;

      try {
        const result = await Share.share({
          message,
          title: `Join ${leagueName}`,
          url: inviteUrl,
        });
        if (result.action === Share.dismissedAction) {
          // Dismissal means nothing was shared — keep the modal open so the
          // user can retry or pick a different league without reopening it.
          LOGGER.debug('Share dismissed by user — keeping invite modal open');
          return;
        }
        setInviteModalVisible(false);
      } catch (error: unknown) {
        LOGGER.error(
          'Error while sharing league invite',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [],
  );

  // Keep the raw nullable result so a query error (userLeagues null/undefined)
  // is distinguishable from a successful empty result, in both the main list
  // and the invite modal.
  const userLeagues = data?.userLeagues;
  const leagues = userLeagues ?? [];
  const leaguesLoadFailed = !loadingLeagues && userLeagues == null;

  // Free-tier league cap (LS-5182). `userLeagues` returns every non-mock league
  // the user participates in (owned or joined) — exactly the set the server
  // counts against FREE_TIER_LEAGUE_LIMIT when creating a league — so the count
  // shown here matches what the backend enforces. Only meaningful for free users
  // with a successfully loaded list; premium users have unlimited leagues.
  const leaguesLoaded = !loadingLeagues && !leaguesLoadFailed;
  const showLeagueCap = !subscriptionLoading && !isPremium && leaguesLoaded;
  const atFreeLeagueLimit =
    showLeagueCap && leagues.length >= FREE_TIER_LEAGUE_LIMIT;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$5"
      >
        {/* Hero section */}
        <ImageBackground
          source={{ uri: 'baseball_banner.jpg' }}
          style={{
            alignItems: 'center',
            borderRadius: 15,
            height: 180,
            justifyContent: 'center',
            marginBottom: 30,
            width: '100%',
          }}
          imageStyle={{ borderRadius: 15, opacity: 0.2 }}
        >
          <H1
            color="$orange9"
            fontSize="$9"
            fontWeight="bold"
            marginTop="$10"
            textAlign="center"
          >
            Baseball Fantasy
          </H1>
          <Text color="$color" fontSize="$6" marginTop="$2" textAlign="center">
            Where Legends Are Made
          </Text>
        </ImageBackground>

        {/* Invite Friends */}
        <XStack space="$3" width="100%">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={openInviteModal}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Invite Friends
            </Text>
          </Button>
        </XStack>

        {/* League management section */}
        <H2
          color="$orange9"
          fontSize="$8"
          fontWeight="bold"
          marginVertical="$3"
        >
          Manage Your Leagues
        </H2>

        {/* Free-tier league count + cap indicator (LS-5182). Surfacing the
            N/3 count up front lets free users at the cap see they need to
            upgrade before filling out the Create form, instead of only
            learning via a GraphQL error Alert on submit. */}
        {showLeagueCap ? (
          <XStack
            alignItems="center"
            flexWrap="wrap"
            space="$2"
            testID="league-cap-indicator"
          >
            <Text color="$gray11" fontSize="$4">
              Your leagues: {leagues.length}/{FREE_TIER_LEAGUE_LIMIT}
            </Text>
            {atFreeLeagueLimit ? (
              <Text
                color={BRAND_GOLD}
                fontSize="$4"
                fontWeight="bold"
                onPress={goToUpgrade}
                testID="league-cap-upgrade"
              >
                — Upgrade to add more
              </Text>
            ) : null}
          </XStack>
        ) : null}

        <XStack justifyContent="space-between" space="$3" width="100%">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            disabled={atFreeLeagueLimit}
            opacity={atFreeLeagueLimit ? 0.5 : 1}
            onPress={openDraftModal}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Create New League
            </Text>
          </Button>
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={() => router.navigate('/baseball/league/join')}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Join League
            </Text>
          </Button>
        </XStack>
        <XStack space="$3" width="100%">
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={() => router.navigate('/baseball/mock-draft')}
          >
            <Text color="$white" fontSize="$5" fontWeight="bold">
              Mock Draft
            </Text>
          </Button>
        </XStack>

        {/* Current Leagues Section */}
        <H2
          color="$orange9"
          fontSize="$8"
          fontWeight="bold"
          marginVertical="$3"
        >
          Your Current Leagues
        </H2>
        <YStack
          backgroundColor="$gray2"
          borderRadius="$3"
          padding="$3"
          space="$2"
        >
          {loadingLeagues ? (
            <Spinner />
          ) : leaguesLoadFailed ? (
            <Text>Could not retrieve leagues.</Text>
          ) : (
            leagues.map((l, index) => {
              const leagueName = l?.name ?? 'Unnamed league';
              // Without a numeric id we can't build a valid league route, so
              // render a non-interactive label instead of a broken Link.
              if (typeof l?.id !== 'number') {
                return (
                  <Text
                    key={`league-${index}`}
                    color="$orange9"
                    fontSize="$6"
                    fontWeight="600"
                    marginBottom="$2"
                  >
                    {leagueName}
                  </Text>
                );
              }
              return (
                <Link
                  href={{
                    params: {
                      leagueId: l.id,
                    },
                    pathname: './league/[leagueId]',
                  }}
                  asChild={true}
                  key={l.id}
                >
                  <Text
                    color="$orange9"
                    fontSize="$6"
                    fontWeight="600"
                    marginBottom="$2"
                  >
                    {leagueName}
                  </Text>
                </Link>
              );
            })
          )}
        </YStack>

        {/* Invite Friends Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={inviteModalVisible}
          onRequestClose={closeInviteModal}
        >
          <YStack
            alignItems="center"
            backgroundColor="rgba(0, 0, 0, 0.9)"
            flex={1}
            justifyContent="center"
          >
            <YStack
              alignItems="center"
              backgroundColor="$gray2"
              borderRadius="$5"
              padding="$7"
              width="90%"
              space="$4"
            >
              <H3 color="$color" fontSize="$8" fontWeight="bold">
                Invite Friends
              </H3>

              {loadingLeagues ? (
                <Spinner />
              ) : leaguesLoadFailed ? (
                <Text color="$gray11" fontSize="$4" textAlign="center">
                  We couldn&apos;t load your leagues. Please try again.
                </Text>
              ) : leagues.length === 0 ? (
                <Text color="$gray11" fontSize="$4" textAlign="center">
                  Create or join a league first, then share an invite link so
                  friends can join you.
                </Text>
              ) : (
                <>
                  <Text color="$gray11" fontSize="$4" textAlign="center">
                    Choose a league to share an invite link
                  </Text>
                  <ScrollView width="100%" maxHeight={300}>
                    <YStack space="$3" width="100%">
                      {leagues.map((l, index) => (
                        <Button
                          key={l?.id ?? `league-${index}`}
                          width="100%"
                          backgroundColor="$orange9"
                          borderRadius="$3"
                          onPress={() =>
                            void shareLeagueInvite({
                              name: l?.name,
                              inviteCode: l?.inviteCode,
                            })
                          }
                        >
                          <Text color="$white" fontSize="$4" fontWeight="bold">
                            {l?.name ?? 'Unnamed league'}
                          </Text>
                        </Button>
                      ))}
                    </YStack>
                  </ScrollView>
                </>
              )}

              <Button
                width="100%"
                backgroundColor="$gray8"
                borderRadius="$3"
                onPress={closeInviteModal}
              >
                <Text color="$white" fontSize="$4">
                  Close
                </Text>
              </Button>
            </YStack>
          </YStack>
        </Modal>

        {/* Draft Modal */}
        <CreateLeagueModal open={modalVisible} onOpenChange={setModalVisible} />
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
