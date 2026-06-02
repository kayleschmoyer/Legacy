import React, { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Button, Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { ArrowLeftRight, ChevronLeft } from '@tamagui/lucide-icons';
import { TradingCenter } from '@legacy-sports/shared-components';

import {
  useGetUserLeaguesQuery,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

function BackButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ opacity: 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <XStack alignItems="center" gap="$1">
        <ChevronLeft size={16} color="$blue10" />
        <Text color="$blue10" fontSize="$4">
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

function ErrorState({
  message,
  onBack,
  onRetry,
}: {
  message: string;
  onBack: () => void;
  onRetry?: () => void;
}) {
  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack alignItems="center" gap="$2">
        <BackButton onPress={onBack} label="Back" />
      </XStack>
      <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
        <ArrowLeftRight size={32} color="$textMuted" />
        <Text color="$textMuted" fontSize="$4" textAlign="center">
          {message}
        </Text>
        {onRetry && (
          <Button size="$3" onPress={onRetry}>
            Retry
          </Button>
        )}
      </YStack>
    </YStack>
  );
}

function LeagueTradingCenter({
  leagueId,
  leagueName,
  leagueOwner,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  leagueOwner: number | null;
  onBack: () => void;
}) {
  const userInfo = useAuthorizedUserInfo();

  const {
    data: teamData,
    loading: teamLoading,
    error: teamError,
    refetch: refetchTeam,
  } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });

  const userTeamId = teamData?.userTeamId;
  const isCommissioner = leagueOwner === userInfo.id || userInfo.isAdmin;

  if (teamLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
        <Spinner size="large" color="$color" />
      </YStack>
    );
  }

  if (teamError) {
    return (
      <ErrorState
        message="Failed to load league data. Please try again."
        onBack={onBack}
        onRetry={() => {
          void refetchTeam();
        }}
      />
    );
  }

  if (userTeamId == null) {
    return (
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <BackButton onPress={onBack} label="Back" />
        </XStack>
        <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
          <ArrowLeftRight size={32} color="$textMuted" />
          <Text color="$textMuted" fontSize="$4" textAlign="center">
            You don&apos;t have a team in this league.
          </Text>
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            Join a team to access the trade center.
          </Text>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1}>
      <XStack alignItems="center" gap="$2" padding="$4" paddingBottom="$2">
        <BackButton onPress={onBack} label={leagueName} />
      </XStack>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <TradingCenter
          leagueId={leagueId}
          userTeamId={userTeamId}
          isCommissioner={isCommissioner}
        />
      </ScrollView>
    </YStack>
  );
}

interface SelectedLeague {
  id: number;
  name: string;
  owner: number | null;
}

export default function TradeCenterPage() {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<SelectedLeague | null>(
    null,
  );

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
    skip: !userInfo?.id || selectedLeague != null,
  });

  if (selectedLeague != null) {
    return (
      <LeagueTradingCenter
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        leagueOwner={selectedLeague.owner}
        onBack={() => setSelectedLeague(null)}
      />
    );
  }

  const leagues = data?.userLeagues ?? [];

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
          Select a league to manage trades.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && error && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <ArrowLeftRight size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              Failed to load leagues. Please try again.
            </Text>
            <Button size="$3" onPress={() => void refetch()}>
              Retry
            </Button>
          </YStack>
        )}

        {!loading && !error && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <ArrowLeftRight size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              Join or create a league to start trading.
            </Text>
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
                  owner: league.owner ?? null,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open trade center for ${league.name ?? 'League'}`}
            >
              <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap="$3" flex={1}>
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
                      {league.name ?? 'League'}
                    </Text>
                    {league.leaguePhase && (
                      <Text
                        fontSize="$2"
                        color="$textMuted"
                        textTransform="capitalize"
                      >
                        {league.leaguePhase}
                      </Text>
                    )}
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
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
