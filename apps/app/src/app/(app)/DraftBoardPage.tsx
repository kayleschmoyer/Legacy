import React, { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, Swords } from '@tamagui/lucide-icons';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { useGetUserLeaguesQuery } from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';

/**
 * Translate web-only routes emitted by EliteDraftBoardScreen into mobile
 * equivalents.  Returns `null` when the route has no mobile counterpart (the
 * caller should show a user-friendly alert instead of navigating nowhere).
 */
function translateWebRoute(path: string): string | null {
  // /baseball/league/:id/roster → /baseball/league/:id (roster is a tab)
  const rosterMatch = path.match(/^\/baseball\/league\/(\d+)\/roster$/);
  if (rosterMatch) return `/baseball/league/${rosterMatch[1]}`;

  // /baseball/mock-draft → no mobile equivalent
  if (path === '/baseball/mock-draft') return null;

  return path;
}

function LeagueDraftBoard({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const websocketUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL ?? '';
  const [wsToken, setWsToken] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void readKeychainValue(Secret.INTERNAL_JWT).then((token: string | null) => {
      if (active && token) setWsToken(token);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <YStack flex={1}>
      <XStack alignItems="center" gap="$2" padding="$4" paddingBottom="$2">
        <Text
          onPress={onBack}
          color="$blue10"
          fontSize="$4"
          pressStyle={{ opacity: 0.7 }}
        >
          <ChevronLeft size={16} color="$blue10" /> {leagueName}
        </Text>
      </XStack>
      <EliteDraftBoardScreen
        leagueId={leagueId}
        onNavigate={(path) => {
          const mobilePath = translateWebRoute(path);
          if (mobilePath) {
            router.push(mobilePath as Href);
          } else {
            Alert.alert(
              'Not Available',
              'This feature is not available in the mobile app yet.',
            );
          }
        }}
        websocketUrl={websocketUrl}
        token={wsToken}
      />
    </YStack>
  );
}

export default function DraftBoardPage() {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  if (selectedLeague != null) {
    return (
      <LeagueDraftBoard
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onBack={() => setSelectedLeague(null)}
      />
    );
  }

  const leagues = data?.userLeagues ?? [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <Swords size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Draft Board
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to view its draft board.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && error != null && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Swords size={32} color="$red10" />
            <Text color="$red10" fontSize="$4" textAlign="center">
              Failed to load leagues.
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              Please check your connection and try again.
            </Text>
          </YStack>
        )}

        {!loading && error == null && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <Swords size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              Join or create a league to access the draft board.
            </Text>
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;

          const isDraftActive =
            league.draftStatus === 'in-progress' ||
            league.draftStatus === 'paused';
          const isDraftComplete = league.draftStatus === 'completed';

          return (
            <Card
              key={leagueId}
              backgroundColor="$surfacePanel"
              borderColor={isDraftActive ? '$green7' : '$surfacePanelBorder'}
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
            >
              <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap="$3" flex={1}>
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={
                      isDraftActive ? '$green3' : '$surfaceSubtle'
                    }
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Swords
                      size={18}
                      color={isDraftActive ? '$green10' : '$color'}
                    />
                  </YStack>
                  <YStack flex={1}>
                    <Text
                      fontSize="$4"
                      fontWeight="600"
                      color="$color"
                      numberOfLines={1}
                    >
                      {league.name ?? 'League'}
                    </Text>
                    <Text
                      fontSize="$2"
                      color={isDraftActive ? '$green10' : '$textMuted'}
                      textTransform="capitalize"
                    >
                      {isDraftActive
                        ? 'Draft in progress'
                        : isDraftComplete
                          ? 'Draft complete'
                          : (league.draftStatus ?? 'Not started')}
                    </Text>
                  </YStack>
                </XStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}
