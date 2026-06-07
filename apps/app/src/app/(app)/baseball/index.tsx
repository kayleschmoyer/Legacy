import React, { useCallback, useState } from 'react';
import { Modal, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, H3, ScrollView, Spinner, Text, YStack } from 'tamagui';
import {
  MLBHome,
  type QuickCreateLeagueInput,
} from '@legacy-sports/shared-components/baseball';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import {
  useCreateLeagueMutation,
  useGetUserLeaguesQuery,
} from '../../../api/db/graphql.generated';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { FREE_TIER_LEAGUE_LIMIT } from '../../../features/subscription/constants';
import { trackPremiumFeatureClick } from '../../../utils/analytics';

const APP_BASE_URL = config.appBaseUrl ?? 'https://legacysports.app';

// Analytics label for the upgrade prompt fired from the league-cap indicator.
const LEAGUE_CAP_FEATURE_NAME = 'Unlimited Leagues';

/**
 * Mobile data wrapper for the shared `MLBHome` (LS-7716). Owns the GraphQL
 * query + mutation and mobile-only concerns (native invite share sheet,
 * free-tier league cap) and feeds props into the cross-platform `MLBHome`.
 * Replaces the former bespoke mobile baseball home.
 */
export default function BaseballHome() {
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const { data, loading: loadingLeagues } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !userInfo?.id,
  });

  const [createLeague] = useCreateLeagueMutation();

  const { isPremium, loading: subscriptionLoading } = useSubscription();

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
  const rawLeagues = userLeagues ?? [];
  const leaguesLoadFailed = !loadingLeagues && userLeagues == null;

  const leagues = React.useMemo(
    () =>
      (userLeagues ?? []).filter(Boolean).map((l) => ({
        id: l?.id ?? 0,
        name: l?.name,
        draftStatus: l?.draftStatus,
        currentWeekNumber: l?.currentWeekNumber,
        weekAdvanceStatus: l?.weekAdvanceStatus,
        maxRosterSize: l?.maxRosterSize,
      })),
    [userLeagues],
  );

  // Free-tier league cap (LS-5182). `userLeagues` returns every non-mock league
  // the user participates in (owned or joined) — exactly the set the server
  // counts against FREE_TIER_LEAGUE_LIMIT — so the count shown here matches what
  // the backend enforces. Only meaningful for free users with a successfully
  // loaded list; premium users have unlimited leagues.
  const leaguesLoaded = !loadingLeagues && !leaguesLoadFailed;
  const showLeagueCap = !subscriptionLoading && !isPremium && leaguesLoaded;
  const atFreeLeagueLimit =
    showLeagueCap && rawLeagues.length >= FREE_TIER_LEAGUE_LIMIT;

  const handleCreateLeague = async (input: QuickCreateLeagueInput) => {
    const result = await createLeague({
      variables: {
        input: {
          leagueName: input.leagueName,
          numberOfTeams: input.numberOfTeams,
          numberOfDivisions: input.numberOfDivisions,
          playerPool: input.playerPool,
          draftMode: input.draftMode,
          selectionMethod: input.selectionMethod,
          draftOrder: input.draftOrder,
          maxRosterSize: input.maxRosterSize,
          isPublic: input.isPublic,
          tradingEnabled: true,
          waiverEnabled: true,
        },
      },
    });
    const id = result.data?.createLeagueAndTeams?.league?.id;
    if (id != null) {
      router.push({
        pathname: '/baseball/league/[leagueId]',
        params: { leagueId: id },
      });
      return;
    }
    throw new Error('Failed to create league. Please try again.');
  };

  return (
    <>
      <MLBHome
        leagues={leagues}
        loading={loadingLeagues}
        error={leaguesLoadFailed}
        userName={userInfo?.username ?? 'Manager'}
        onCreateLeague={handleCreateLeague}
        onJoinLeague={() => router.navigate('/baseball/league/join')}
        onMockDraft={() => router.navigate('/baseball/mock-draft')}
        onScoreboard={() => router.navigate('/baseball/scoreboard')}
        onViewLeague={(id) =>
          router.push({
            pathname: '/baseball/league/[leagueId]',
            params: { leagueId: id },
          })
        }
        onInviteFriends={openInviteModal}
        leagueCap={
          showLeagueCap
            ? {
                count: rawLeagues.length,
                limit: FREE_TIER_LEAGUE_LIMIT,
                atLimit: atFreeLeagueLimit,
                onUpgrade: goToUpgrade,
              }
            : undefined
        }
      />

      {/* Invite Friends Modal (mobile-only native share, LS-5203) */}
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
            gap="$4"
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
            ) : rawLeagues.length === 0 ? (
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
                  <YStack gap="$3" width="100%">
                    {rawLeagues.map((l, index) => (
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
    </>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
