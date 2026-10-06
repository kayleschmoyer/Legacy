import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { RefreshCw } from '@tamagui/lucide-icons/icons/RefreshCw';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { Button, Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { config } from '@legacy-sports/app-config/native';
import { TradingCenter, useWebSocket } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';

import {
  useGetLeagueByIdQuery,
  useGetUserLeaguesQuery,
  useGetUserTeamIdQuery,
} from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';
import { useSystemBackAction } from '../../../../common/hooks/useSystemBackAction';
import { useSubscription } from '../../../../features/subscription/useSubscription';

// ── LeagueTrades ──────────────────────────────────────────────────────────────

interface LeagueTradesProps {
  leagueId: number;
  leagueName: string;
  tradeOfferId?: number;
}

function LeagueTrades({
  leagueId,
  leagueName,
  tradeOfferId,
}: LeagueTradesProps) {
  const router = useRouter();
  const { isPremium } = useSubscription();
  const [wsToken, setWsToken] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (active && token) setWsToken(token);
      } catch (err) {
        LOGGER.error(
          'TradeCenterPage: failed to read keychain token',
          err instanceof Error ? err : String(err),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { data: teamData, loading: teamLoading } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });
  const userTeamId = teamData?.userTeamId ?? null;

  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
  });
  const league = leagueData?.league;
  const permissionLevel = league?.userMembership?.permissionLevel;
  const isCommissioner =
    permissionLevel === 'general_manager' ||
    permissionLevel === 'assistant_manager' ||
    permissionLevel === 'commissioner';

  const tradeRefetchRef = useRef<(() => void) | null>(null);
  const onSubscribeRefresh = useCallback((refetch: () => void) => {
    tradeRefetchRef.current = refetch;
    return () => {
      tradeRefetchRef.current = null;
    };
  }, []);

  const wsUrl = config.websocketUrl;
  useWebSocket({
    url: wsUrl ?? undefined,
    token: wsToken,
    leagueId,
    viewContext: 'league',
    autoConnect: !!wsUrl && !!wsToken,
    onTradeOffer: () => {
      tradeRefetchRef.current?.();
    },
    onRosterUpdate: () => {
      tradeRefetchRef.current?.();
    },
  });

  if (teamLoading || leagueLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color="$color" />
        <Text color="$textMuted" fontSize="$3">
          Loading trades…
        </Text>
      </YStack>
    );
  }

  if (userTeamId == null) {
    return (
      <YStack flex={1}>
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          gap="$3"
          padding="$6"
        >
          <ArrowLeftRight size={32} color="$textMuted" />
          <Text color="$textMuted" fontSize="$4" textAlign="center">
            You are not a member of {leagueName}.
          </Text>
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            Join this league to view and submit trade offers.
          </Text>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <ScrollView style={{ flex: 1 }}>
        <TradingCenter
          leagueId={leagueId}
          userTeamId={userTeamId}
          isCommissioner={isCommissioner}
          deepLinkOfferId={tradeOfferId}
          onSubscribeRefresh={onSubscribeRefresh}
          isPremium={isPremium}
          onUpgradePremium={() => router.navigate('subscription-settings')}
        />
      </ScrollView>
    </YStack>
  );
}

// ── TradeCenterPage ───────────────────────────────────────────────────────────

export default function TradeCenterPage() {
  const { leagueId: leagueIdParam, tradeOfferId: tradeOfferIdParam } =
    useLocalSearchParams<{
      leagueId?: string;
      tradeOfferId?: string;
    }>();
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();

  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
    tradeOfferId?: number;
  } | null>(null);

  const clearSelectedLeague = useCallback(() => setSelectedLeague(null), []);

  const { data, previousData, loading, error, refetch } =
    useGetUserLeaguesQuery({
      skip: !userInfo?.id,
      fetchPolicy: 'cache-first',
    });

  // Fall back to previousData so stale leagues render instantly on re-entry
  // instead of showing the spinner when Apollo briefly resets data during a
  // skip transition or screen remount.
  // Pre-select a league when arriving via deep link with ?leagueId=X[&tradeOfferId=Y]
  const allLeagues = useMemo(
    () => (data ?? previousData)?.userLeagues ?? [],
    [data, previousData],
  );
  // Only active-phase leagues allow trading — filter out pre-draft and offseason
  const leagues = useMemo(
    () => allLeagues.filter((l) => l.leaguePhase === 'active'),
    [allLeagues],
  );
  useEffect(() => {
    if (!leagueIdParam || selectedLeague != null) return;
    const id = parseInt(leagueIdParam, 10);
    if (isNaN(id)) return;
    const matched = leagues.find((l) => l.id === id);
    if (matched?.id != null) {
      const parsedTradeOfferId = tradeOfferIdParam
        ? parseInt(tradeOfferIdParam, 10)
        : undefined;
      setSelectedLeague({
        id: matched.id,
        name: matched.name ?? 'League',
        tradeOfferId:
          parsedTradeOfferId && !isNaN(parsedTradeOfferId)
            ? parsedTradeOfferId
            : undefined,
      });
    }
  }, [leagueIdParam, tradeOfferIdParam, leagues, selectedLeague]);

  // The in-content back links were removed in LS-8766, so system back has to
  // unwind the league selection before it pops the screen.
  useSystemBackAction(selectedLeague != null, clearSelectedLeague);

  if (selectedLeague != null) {
    return (
      <LeagueTrades
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        tradeOfferId={selectedLeague.tradeOfferId}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <ArrowLeftRight size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Trade Center
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to view and manage trade offers.
        </Text>

        {loading && leagues.length === 0 && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {error && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <RefreshCw size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              Failed to load leagues.
            </Text>
            <Text
              onPress={() => void refetch()}
              color="$brandGoldLight"
              fontSize="$3"
              pressStyle={{ opacity: 0.7 }}
              accessibilityRole="button"
            >
              Try again
            </Text>
          </YStack>
        )}

        {!loading && !error && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Users size={32} color="$textMuted" />
            {allLeagues.length === 0 ? (
              <>
                <Text color="$textMuted" fontSize="$4" textAlign="center">
                  No leagues found.
                </Text>
                <Text color="$textMuted" fontSize="$3" textAlign="center">
                  Join or create a league to start trading.
                </Text>
                <Button
                  size="$3"
                  onPress={() => router.navigate('/league/join?tab=browse')}
                  accessibilityRole="button"
                >
                  Browse Leagues
                </Button>
              </>
            ) : (
              <Text color="$textMuted" fontSize="$4" textAlign="center">
                Trading is only available during the active season.
              </Text>
            )}
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;
          return (
            <Card
              key={leagueId}
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$5"
              padding="$4"
              pressStyle={{ opacity: 0.8, scale: 0.98 }}
              onPress={() =>
                setSelectedLeague({
                  id: leagueId,
                  name: league.name ?? 'League',
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`View trades for ${league.name ?? 'League'}`}
            >
              <XStack alignItems="center" gap="$3">
                <YStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                >
                  <ArrowLeftRight size={18} color="$color" />
                </YStack>
                <YStack flex={1}>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {league.name}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
