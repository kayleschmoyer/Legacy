import React from 'react';
import {
  Button,
  H1,
  H2,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  formatDraftStatusForCard,
  getDraftStatusColors,
} from '../../utils/draftStatus';

export interface NFLHomeLeague {
  id: string | number;
  name?: string | null;
  draftStatus?: string | null;
  currentWeekNumber?: number | null;
  weekAdvanceStatus?: string | null;
}

export interface NFLHomeProps {
  leagues?: NFLHomeLeague[];
  loading?: boolean;
  error?: boolean;
  onCreateLeague: () => void;
  onJoinLeague?: () => void;
  onBrowseLeagues?: () => void;
  onViewLeague: (leagueId: string | number) => void;
}

function getLeagueStatusLabel(league: NFLHomeLeague): string {
  if (!league.draftStatus) return '';
  if (league.draftStatus === 'not-started' || league.draftStatus === 'queued') {
    return 'Draft Pending';
  }
  if (league.draftStatus === 'completed' && league.currentWeekNumber != null) {
    return `Week ${league.currentWeekNumber}`;
  }
  return formatDraftStatusForCard(league.draftStatus);
}

function NFLHome({
  leagues = [],
  loading = false,
  error = false,
  onCreateLeague,
  onJoinLeague,
  onBrowseLeagues,
  onViewLeague,
}: NFLHomeProps) {
  const hasLeagues = leagues.length > 0;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack backgroundColor="$background" flexGrow={1} padding="$5" gap="$5">
        {/* Hero */}
        <YStack
          alignItems="center"
          backgroundColor="$glassSurface"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$glassBorder"
          padding="$6"
          marginBottom="$3"
        >
          <H1 color="$color" fontSize="$9" fontWeight="800" textAlign="center">
            Football Fantasy
          </H1>
          <Text
            color="$glassTextSubdued"
            fontSize="$5"
            marginTop="$2"
            textAlign="center"
          >
            {hasLeagues
              ? 'Manage your leagues and get ready for game day.'
              : 'Launch your first fantasy football league in minutes.'}
          </Text>
        </YStack>

        {/* League management actions */}
        <H2 color="$color" fontSize="$7" fontWeight="700" marginBottom="$2">
          Manage Your Leagues
        </H2>
        <XStack
          justifyContent="space-between"
          gap="$3"
          width="100%"
          flexWrap="wrap"
        >
          <Button
            flex={1}
            backgroundColor="$orange9"
            borderRadius="$3"
            onPress={onCreateLeague}
            accessibilityLabel="Create a new football league"
            data-testid="create-league-button"
          >
            <Text color="white" fontSize="$4" fontWeight="700">
              Create League
            </Text>
          </Button>
          {onJoinLeague && (
            <Button
              flex={1}
              backgroundColor="$orange9"
              borderRadius="$3"
              onPress={onJoinLeague}
              accessibilityLabel="Join a football league"
            >
              <Text color="white" fontSize="$4" fontWeight="700">
                Join League
              </Text>
            </Button>
          )}
          {onBrowseLeagues && (
            <Button
              flex={1}
              backgroundColor="$orange9"
              borderRadius="$3"
              onPress={onBrowseLeagues}
              accessibilityLabel="Browse public football leagues"
            >
              <Text color="white" fontSize="$4" fontWeight="700">
                Browse Leagues
              </Text>
            </Button>
          )}
        </XStack>

        {/* Your Football Leagues */}
        <H2 color="$color" fontSize="$7" fontWeight="700" marginVertical="$3">
          Your Football Leagues
        </H2>
        <YStack
          backgroundColor="$gray2"
          borderRadius="$3"
          padding="$3"
          gap="$2"
        >
          {loading ? (
            <YStack alignItems="center" padding="$5">
              <Spinner size="large" color="$orange9" />
            </YStack>
          ) : error ? (
            <YStack alignItems="center" padding="$5" gap="$3">
              <Text fontSize="$5" color="$red10" textAlign="center">
                Could not load your leagues
              </Text>
              <Text color="$gray10" fontSize="$3" textAlign="center">
                There was a problem fetching your league data.
              </Text>
            </YStack>
          ) : leagues.length === 0 ? (
            <YStack alignItems="center" padding="$5" gap="$3">
              <Text color="$color" fontSize="$5" textAlign="center">
                No football leagues yet
              </Text>
              <Text color="$gray10" fontSize="$3" textAlign="center">
                Create your first football league to get started.
              </Text>
              <Button
                backgroundColor="$orange9"
                borderRadius="$3"
                onPress={onCreateLeague}
                data-testid="create-first-league-button"
                accessibilityLabel="Create your first football league"
              >
                <Text color="white" fontWeight="700">
                  Create your first football league
                </Text>
              </Button>
            </YStack>
          ) : (
            leagues.map((league) => {
              const statusColors = getDraftStatusColors(league.draftStatus);
              const statusLabel = getLeagueStatusLabel(league);
              return (
                <YStack
                  key={league.id}
                  backgroundColor="$glassSurface"
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor="$glassBorder"
                  marginBottom="$2"
                  cursor="pointer"
                  onPress={() => onViewLeague(league.id)}
                  accessibilityLabel={`View ${league.name ?? 'league'}`}
                  pressStyle={{ opacity: 0.8, scale: 0.99 }}
                >
                  <Text color="$color" fontSize="$6" fontWeight="600">
                    {league.name ?? 'Unnamed League'}
                  </Text>
                  <XStack gap="$2" marginTop="$1" flexWrap="wrap">
                    <YStack
                      backgroundColor="$glassSurface"
                      borderRadius="$3"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderWidth={1}
                      borderColor="$glassBorder"
                    >
                      <Text
                        color="$orange9"
                        fontSize="$2"
                        fontWeight="700"
                        textTransform="uppercase"
                        letterSpacing={0.5}
                      >
                        Football
                      </Text>
                    </YStack>
                    {statusLabel ? (
                      <YStack
                        backgroundColor={statusColors.bg}
                        borderRadius="$3"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderWidth={1}
                        borderColor={statusColors.border}
                      >
                        <Text
                          color={statusColors.text}
                          fontSize="$2"
                          fontWeight="700"
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          {statusLabel}
                        </Text>
                      </YStack>
                    ) : null}
                    {(league.weekAdvanceStatus === 'processing' ||
                      league.weekAdvanceStatus === 'queued') && (
                      <YStack
                        backgroundColor="$yellow3"
                        borderRadius="$3"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderWidth={1}
                        borderColor="$yellow7"
                        accessibilityLabel="League week advancing"
                      >
                        <Text color="$yellow11" fontSize="$2" fontWeight="600">
                          Advancing
                        </Text>
                      </YStack>
                    )}
                  </XStack>
                </YStack>
              );
            })
          )}
        </YStack>
      </YStack>
    </ScrollView>
  );
}

export { NFLHome };
export default NFLHome;
