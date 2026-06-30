import React from 'react';
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  ScrollView,
  Separator,
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
  /** When false, renders a sign-in CTA instead of the leagues list. Defaults to true. */
  isAuthenticated?: boolean;
  onCreateLeague: () => void;
  onJoinLeague?: () => void;
  onBrowseLeagues?: () => void;
  onViewLeague: (leagueId: string | number) => void;
  /** Navigate to sign-in from the unauthenticated notice. */
  onSignIn?: () => void;
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
  isAuthenticated = true,
  onCreateLeague,
  onJoinLeague,
  onBrowseLeagues,
  onViewLeague,
  onSignIn,
}: NFLHomeProps) {
  const hasLeagues = leagues.length > 0;

  // Static, football-specific "getting started" copy ported from the canonical
  // (now-retired) web FootballLandingPage side panel. Varies only by whether the
  // manager already has leagues — no user/query data is needed (LS-7819).
  const quickWins = hasLeagues
    ? [
        'Check your starting lineup before Sunday kickoff.',
        'Monitor waiver wire adds and drops mid-week.',
        'Share invite codes to fill open roster spots.',
      ]
    : [
        'Choose between D/ST or IDP (individual defensive players).',
        'Set your draft date and invite managers to lock in.',
        'Pick snake or auction — both are fully supported.',
      ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        backgroundColor="$background"
        flexGrow={1}
        paddingHorizontal="$4"
        paddingVertical="$5"
        gap="$6"
        // Mobile-first padding: tighter on phones, roomier once the viewport can
        // afford it. Restores the responsive padding the web-only
        // FootballLandingPage had before the NFLHome rewrite (LS-7819).
        $gtSm={{ paddingHorizontal: '$6', paddingVertical: '$7' }}
      >
        {/* Hero — stacked on phones, reflows to side-by-side (copy + side panel)
            on desktop, with padding scaling up by tier. Mirrors the canonical
            FootballLandingPage hero breakpoints (LS-7819). */}
        <XStack
          backgroundColor="$glassSurface"
          borderRadius="$8"
          borderWidth={1}
          borderColor="$glassBorder"
          flexDirection="column"
          padding="$6"
          gap="$6"
          $gtSm={{ padding: '$7' }}
          $gtMd={{ flexDirection: 'row', padding: '$9' }}
        >
          <YStack flex={1} minWidth={280} gap="$4">
            <H1
              color="$color"
              fontSize="$9"
              fontWeight="800"
              $gtSm={{ fontSize: '$11' }}
            >
              Football Fantasy
            </H1>
            <Text
              color="$glassTextSubdued"
              fontSize="$4"
              $gtSm={{ fontSize: '$5' }}
            >
              {hasLeagues
                ? 'Manage your leagues and get ready for game day.'
                : 'Launch your first fantasy football league in minutes.'}
            </Text>
            {/* Action row: natural-width buttons that wrap on narrow viewports
                instead of stretching edge-to-edge (LS-7819). */}
            <XStack gap="$3" flexWrap="wrap" marginTop="$2">
              <Button
                backgroundColor="$orange9"
                borderRadius="$3"
                paddingHorizontal="$5"
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
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  paddingHorizontal="$5"
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
                  backgroundColor="$orange9"
                  borderRadius="$3"
                  paddingHorizontal="$5"
                  onPress={onBrowseLeagues}
                  accessibilityLabel="Browse public football leagues"
                >
                  <Text color="white" fontSize="$4" fontWeight="700">
                    Browse Leagues
                  </Text>
                </Button>
              )}
            </XStack>
          </YStack>

          {/* Getting-started side panel: full-width above the copy on phones,
              pinned to the right on desktop via the hero's $gtMd row reflow. */}
          <YStack width="100%" maxWidth={380} gap="$4">
            <YStack
              backgroundColor="$glassSurfaceLight"
              borderRadius="$7"
              padding="$6"
              borderWidth={1}
              borderColor="$glassBorder"
              gap="$4"
            >
              <YStack gap="$1">
                <Paragraph
                  fontSize="$3"
                  color="$glassTextMuted"
                  textTransform="uppercase"
                  letterSpacing={1}
                >
                  Getting Started
                </Paragraph>
                <H3 fontSize="$7" color="$color">
                  Build your first roster
                </H3>
              </YStack>
              <Separator backgroundColor="$glassBorder" />
              <Paragraph fontSize="$3" color="$glassTextSubdued">
                Create or join a league to start tracking your season — weekly
                matchups, roster stats, and draft countdowns will appear here.
              </Paragraph>
            </YStack>

            <YStack
              backgroundColor="$glassSurfaceLight"
              borderRadius="$7"
              padding="$5"
              borderWidth={1}
              borderColor="$glassBorder"
              gap="$3"
            >
              <Paragraph
                fontSize="$3"
                color="$glassTextMuted"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Quick Wins
              </Paragraph>
              <Paragraph fontSize="$4" color="$color">
                Make sure your league is ready before the first kickoff.
              </Paragraph>
              {quickWins.map((item, index) => (
                <XStack key={index} alignItems="center" gap="$3">
                  <YStack
                    width={10}
                    height={10}
                    borderRadius={9999}
                    backgroundColor="$orange9"
                  />
                  <Paragraph fontSize="$3" color="$glassTextSubdued" flex={1}>
                    {item}
                  </Paragraph>
                </XStack>
              ))}
            </YStack>
          </YStack>
        </XStack>

        {/* Your Football Leagues */}
        <YStack gap="$4">
          <H2 color="$color" fontSize="$7" fontWeight="700">
            Your Football Leagues
          </H2>
          <YStack
            backgroundColor="$gray2"
            borderRadius="$3"
            padding="$3"
            gap="$2"
          >
            {!isAuthenticated ? (
              <YStack alignItems="center" padding="$5" gap="$3">
                <Text fontSize="$5" color="$color" textAlign="center">
                  Sign in to manage your fantasy football leagues
                </Text>
                <Text color="$gray10" fontSize="$3" textAlign="center">
                  Authentication is required to access drafts, invite codes, and
                  lineup management.
                </Text>
                {onSignIn ? (
                  <Button
                    alignSelf="flex-start"
                    backgroundColor="$orange9"
                    borderRadius="$3"
                    onPress={onSignIn}
                    accessibilityLabel="Sign in to get started"
                  >
                    <Text color="white" fontWeight="700">
                      Get Started Free
                    </Text>
                  </Button>
                ) : null}
              </YStack>
            ) : loading ? (
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
                  <XStack
                    key={league.id}
                    backgroundColor="$glassSurface"
                    borderRadius="$3"
                    padding="$3"
                    borderWidth={1}
                    borderColor="$glassBorder"
                    marginBottom="$2"
                    flexDirection="column"
                    alignItems="flex-start"
                    gap="$2"
                    cursor="pointer"
                    onPress={() => onViewLeague(league.id)}
                    accessibilityLabel={`View ${league.name ?? 'league'}`}
                    role="link"
                    pressStyle={{ opacity: 0.8, scale: 0.99 }}
                    // League rows stack name over badges on phones and lay out in
                    // a single centered row on wider viewports (LS-7819).
                    $gtSm={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      color="$color"
                      fontSize="$6"
                      fontWeight="600"
                      flex={1}
                      minWidth={160}
                    >
                      {league.name ?? 'Unnamed League'}
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
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
                          <Text
                            color="$yellow11"
                            fontSize="$2"
                            fontWeight="600"
                          >
                            Advancing
                          </Text>
                        </YStack>
                      )}
                    </XStack>
                  </XStack>
                );
              })
            )}
          </YStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

export { NFLHome };
export default NFLHome;
