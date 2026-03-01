import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, XStack, YStack } from '@legacy-sports/shared-components';
import { H1, H2, Input, Spinner, Text } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  GetPublicLeagues,
  useGetPublicLeaguesQuery,
  useJoinPublicLeagueMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

// Player pool display label map
const PLAYER_POOL_LABELS: Record<string, string> = {
  all: 'All MLB',
  nl: 'NL Only',
  al: 'AL Only',
};

// Draft status display labels
const DRAFT_STATUS_LABELS: Record<string, string> = {
  'not-started': 'Open',
  queued: 'Queued',
  'in-progress': 'In Progress',
  paused: 'Paused',
  completed: 'Completed',
};

// Draft status color classes
const DRAFT_STATUS_COLORS: Record<string, string> = {
  'not-started': '$green10',
  queued: '$orange10',
  'in-progress': '$blue10',
  paused: '$yellow10',
  completed: '$gray10',
};

// Filter option types
type DraftStatusFilter = 'all' | 'not-started' | 'queued' | 'in-progress';
type PlayerPoolFilter = 'all' | 'nl' | 'al';

const DRAFT_STATUS_FILTERS: { label: string; value: DraftStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open (Not Started)', value: 'not-started' },
  { label: 'Queued', value: 'queued' },
  { label: 'In Progress', value: 'in-progress' },
];

const PLAYER_POOL_FILTERS: { label: string; value: PlayerPoolFilter }[] = [
  { label: 'All Leagues', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
];

export function LeagueDiscoveryPage(): React.JSX.Element {
  const navigate = useNavigate();

  // Filters
  const [search, setSearch] = useState('');
  const [draftStatusFilter, setDraftStatusFilter] =
    useState<DraftStatusFilter>('all');
  const [playerPoolFilter, setPlayerPoolFilter] =
    useState<PlayerPoolFilter>('all');

  // Join state
  const [joiningLeagueId, setJoiningLeagueId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  const { data, loading, refetch } = useGetPublicLeaguesQuery({
    variables: {
      search: search.trim() || undefined,
      draftStatus: draftStatusFilter !== 'all' ? draftStatusFilter : undefined,
      playerPool: playerPoolFilter !== 'all' ? playerPoolFilter : undefined,
      limit: 50,
      offset: 0,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [joinPublicLeague, { loading: joining }] = useJoinPublicLeagueMutation({
    refetchQueries: [{ query: GetPublicLeagues }],
  });

  const leagues = data?.publicLeagues ?? [];

  const handleJoinStart = (leagueId: number) => {
    setJoiningLeagueId(leagueId);
    setTeamName('');
    setJoinError(null);
    setJoinSuccess(null);
  };

  const handleJoinCancel = () => {
    setJoiningLeagueId(null);
    setTeamName('');
    setJoinError(null);
  };

  const handleJoinSubmit = async (leagueId: number) => {
    if (!teamName.trim()) {
      setJoinError('Please enter a team name');
      return;
    }

    setJoinError(null);

    try {
      const result = await joinPublicLeague({
        variables: { leagueId, teamName: teamName.trim() },
      });

      if (result.data?.joinPublicLeague?.success) {
        const joinedLeagueId = result.data.joinPublicLeague.leagueId;
        setJoinSuccess(result.data.joinPublicLeague.message ?? 'Joined!');

        // Navigate to the league after brief delay
        setTimeout(() => {
          if (joinedLeagueId) {
            navigate(`/baseball/league/${joinedLeagueId}`);
          }
        }, 1200);
      }
    } catch (err) {
      setJoinError((err as Error).message || 'Failed to join league');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleRefresh = () => {
    void refetch();
  };

  return (
    <YStack
      flex={1}
      padding="$6"
      $sm={{ padding: '$3' }}
      space="$5"
      maxWidth={900}
      margin="auto"
      width="100%"
    >
      <PageMeta
        title="Browse Public Leagues"
        description="Discover and join public fantasy baseball leagues on Legacy Sports. Browse open leagues and jump in without an invite code."
      />

      {/* Header */}
      <YStack space="$2">
        <H1 size="$8" color="$color">
          <span role="img" aria-label="globe">
            🌐
          </span>{' '}
          Browse Public Leagues
        </H1>
        <Text size="$4" color="$gray11">
          Discover open leagues you can join without an invite code
        </Text>
      </YStack>

      {/* Search Bar */}
      <Input
        size="$4"
        placeholder="Search leagues by name…"
        value={search}
        onChangeText={handleSearchChange}
        borderColor="$borderColor"
        backgroundColor="$color1"
      />

      {/* Filters Row */}
      <YStack space="$3">
        {/* Draft Status Filter */}
        <YStack space="$2">
          <Text size="$3" fontWeight="600" color="$gray11">
            Draft Status
          </Text>
          <XStack space="$2" flexWrap="wrap">
            {DRAFT_STATUS_FILTERS.map((opt) => (
              <Button
                key={opt.value}
                size="$3"
                onPress={() => setDraftStatusFilter(opt.value)}
                backgroundColor={
                  draftStatusFilter === opt.value ? BRAND_NAVY_LIGHT : '$color2'
                }
                borderColor={
                  draftStatusFilter === opt.value
                    ? BRAND_NAVY_LIGHT
                    : '$borderColor'
                }
                borderWidth={draftStatusFilter === opt.value ? 2 : 1}
                hoverStyle={{
                  backgroundColor:
                    draftStatusFilter === opt.value ? BRAND_NAVY : '$color3',
                }}
                pressStyle={{ scale: 0.95 }}
              >
                <Text
                  color={
                    draftStatusFilter === opt.value ? BRAND_GOLD : '$color'
                  }
                  fontWeight={draftStatusFilter === opt.value ? '600' : '400'}
                  size="$3"
                >
                  {opt.label}
                </Text>
              </Button>
            ))}
          </XStack>
        </YStack>

        {/* Player Pool Filter */}
        <YStack space="$2">
          <Text size="$3" fontWeight="600" color="$gray11">
            Player Pool
          </Text>
          <XStack space="$2" flexWrap="wrap">
            {PLAYER_POOL_FILTERS.map((opt) => (
              <Button
                key={opt.value + opt.label}
                size="$3"
                onPress={() => setPlayerPoolFilter(opt.value)}
                backgroundColor={
                  playerPoolFilter === opt.value ? BRAND_NAVY_LIGHT : '$color2'
                }
                borderColor={
                  playerPoolFilter === opt.value
                    ? BRAND_NAVY_LIGHT
                    : '$borderColor'
                }
                borderWidth={playerPoolFilter === opt.value ? 2 : 1}
                hoverStyle={{
                  backgroundColor:
                    playerPoolFilter === opt.value ? BRAND_NAVY : '$color3',
                }}
                pressStyle={{ scale: 0.95 }}
              >
                <Text
                  color={playerPoolFilter === opt.value ? BRAND_GOLD : '$color'}
                  fontWeight={playerPoolFilter === opt.value ? '600' : '400'}
                  size="$3"
                >
                  {opt.label}
                </Text>
              </Button>
            ))}
          </XStack>
        </YStack>
      </YStack>

      {/* Results Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text size="$4" color="$gray11">
          {loading
            ? 'Loading…'
            : `${leagues.length} league${leagues.length !== 1 ? 's' : ''} found`}
        </Text>
        <Button size="$3" onPress={handleRefresh} disabled={loading}>
          <Text size="$3">↻ Refresh</Text>
        </Button>
      </XStack>

      {/* Loading State */}
      {loading && leagues.length === 0 && (
        <YStack alignItems="center" padding="$8">
          <Spinner size="large" />
          <Text size="$4" color="$gray10" marginTop="$4">
            Searching for public leagues…
          </Text>
        </YStack>
      )}

      {/* Empty State */}
      {!loading && leagues.length === 0 && (
        <Card
          elevate
          bordered
          backgroundColor="$color2"
          borderColor="$borderColor"
          padding="$6"
        >
          <YStack alignItems="center" space="$4">
            <Text size="$8">
              <span role="img" aria-label="trophy">
                🏆
              </span>
            </Text>
            <H2 size="$6" textAlign="center">
              No public leagues found
            </H2>
            <Text size="$4" color="$gray10" textAlign="center">
              {search.trim()
                ? `No leagues matched "${search}". Try adjusting your search or filters.`
                : 'No public leagues are currently open. Be the first to create one!'}
            </Text>
            <Button
              size="$4"
              onPress={() => navigate('/baseball/league/create')}
              backgroundColor={BRAND_NAVY_LIGHT}
              borderColor={BRAND_NAVY_LIGHT}
              borderWidth={2}
              hoverStyle={{ backgroundColor: BRAND_NAVY }}
              pressStyle={{ scale: 0.97 }}
            >
              <Text color={BRAND_GOLD} fontWeight="600">
                Create a Public League
              </Text>
            </Button>
          </YStack>
        </Card>
      )}

      {/* League Cards */}
      <YStack space="$3">
        {leagues.map((league) => {
          const leagueId = league.id ?? 0;
          const isJoiningThis = joiningLeagueId === leagueId;
          const draftStatus = league.draftStatus ?? '';
          const statusColor = DRAFT_STATUS_COLORS[draftStatus] ?? '$gray10';
          const statusLabel = DRAFT_STATUS_LABELS[draftStatus] ?? draftStatus;
          const poolLabel =
            PLAYER_POOL_LABELS[league.playerPool ?? ''] ?? league.playerPool;

          return (
            <Card
              key={leagueId}
              elevate
              bordered
              backgroundColor="$color2"
              borderColor={
                league.isAlreadyMember
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.5)
                  : '$borderColor'
              }
              borderWidth={league.isAlreadyMember ? 2 : 1}
              animation="quick"
              hoverStyle={{
                borderColor: BRAND_NAVY_LIGHT,
                backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.06),
              }}
            >
              <YStack padding="$4" space="$3">
                {/* League Header */}
                <XStack justifyContent="space-between" alignItems="flex-start">
                  <YStack flex={1} space="$1" marginRight="$3">
                    <Text size="$5" fontWeight="700" color="$color">
                      {league.name}
                    </Text>
                    <XStack space="$2" flexWrap="wrap">
                      {/* Draft Status Badge */}
                      <Text
                        size="$2"
                        color={statusColor}
                        backgroundColor={withAlpha('#ffffff', 0.08)}
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderRadius="$2"
                        fontWeight="600"
                      >
                        {statusLabel}
                      </Text>
                      {/* Player Pool Badge */}
                      <Text
                        size="$2"
                        color="$blue10"
                        backgroundColor={withAlpha('#ffffff', 0.08)}
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderRadius="$2"
                      >
                        {poolLabel}
                      </Text>
                    </XStack>
                  </YStack>

                  {/* Spots Available */}
                  <YStack alignItems="flex-end" space="$1">
                    <Text size="$3" fontWeight="700" color="$color">
                      {league.availableSpots} / {league.totalSpots}
                    </Text>
                    <Text size="$2" color="$gray10">
                      spots open
                    </Text>
                  </YStack>
                </XStack>

                {/* Metadata Row */}
                <XStack space="$4" flexWrap="wrap">
                  <Text size="$3" color="$gray10">
                    <span role="img" aria-label="baseball cap">
                      🧢
                    </span>{' '}
                    {league.maxRosterSize} players/roster
                  </Text>
                </XStack>

                {/* Already Member Banner */}
                {league.isAlreadyMember && (
                  <XStack
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                    borderRadius="$3"
                    padding="$3"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Text size="$3" color={BRAND_GOLD} fontWeight="600">
                      ✓ You're already in this league
                    </Text>
                    <Button
                      size="$3"
                      onPress={() => navigate(`/baseball/league/${leagueId}`)}
                      backgroundColor={BRAND_NAVY_LIGHT}
                      borderColor={BRAND_NAVY_LIGHT}
                      pressStyle={{ scale: 0.97 }}
                    >
                      <Text color={BRAND_GOLD} fontWeight="600" size="$3">
                        View League →
                      </Text>
                    </Button>
                  </XStack>
                )}

                {/* Full Banner */}
                {league.isFull && !league.isAlreadyMember && (
                  <YStack
                    backgroundColor={withAlpha('#ff4444', 0.1)}
                    borderRadius="$3"
                    padding="$3"
                  >
                    <Text size="$3" color="$red10" fontWeight="600">
                      <span role="img" aria-label="no entry">
                        ⛔
                      </span>{' '}
                      This league is full
                    </Text>
                  </YStack>
                )}

                {/* Join Section */}
                {!league.isAlreadyMember &&
                  !league.isFull &&
                  (isJoiningThis ? (
                    <YStack space="$3">
                      {/* Join success */}
                      {joinSuccess && (
                        <YStack
                          backgroundColor={withAlpha('#22c55e', 0.15)}
                          borderRadius="$3"
                          padding="$3"
                        >
                          <Text size="$3" color="$green10" fontWeight="600">
                            ✓ {joinSuccess} Redirecting…
                          </Text>
                        </YStack>
                      )}

                      {/* Join error */}
                      {joinError && (
                        <YStack
                          backgroundColor={withAlpha('#ff4444', 0.1)}
                          borderRadius="$3"
                          padding="$3"
                        >
                          <Text size="$3" color="$red10">
                            {joinError}
                          </Text>
                        </YStack>
                      )}

                      <YStack space="$2">
                        <Text size="$3" fontWeight="600" color="$gray12">
                          Choose a team name
                        </Text>
                        <Input
                          size="$4"
                          placeholder="e.g. Shortstop Stars"
                          value={teamName}
                          onChangeText={setTeamName}
                          borderColor="$borderColor"
                          backgroundColor="$color1"
                          disabled={joining || !!joinSuccess}
                          maxLength={40}
                        />
                        <Text size="$2" color="$gray10">
                          Your team name will be visible to all league members
                        </Text>
                      </YStack>

                      <XStack space="$2" justifyContent="flex-end">
                        <Button
                          size="$3"
                          onPress={handleJoinCancel}
                          disabled={joining || !!joinSuccess}
                          backgroundColor="$color3"
                          pressStyle={{ scale: 0.97 }}
                        >
                          <Text size="$3">Cancel</Text>
                        </Button>
                        <Button
                          size="$3"
                          onPress={() => void handleJoinSubmit(leagueId)}
                          disabled={
                            joining || !!joinSuccess || !teamName.trim()
                          }
                          backgroundColor={BRAND_NAVY_LIGHT}
                          borderColor={BRAND_NAVY_LIGHT}
                          opacity={joining ? 0.7 : 1}
                          pressStyle={{ scale: 0.97 }}
                        >
                          {joining ? (
                            <Spinner size="small" />
                          ) : (
                            <Text color={BRAND_GOLD} fontWeight="600" size="$3">
                              Join League
                            </Text>
                          )}
                        </Button>
                      </XStack>
                    </YStack>
                  ) : (
                    <XStack justifyContent="flex-end">
                      <Button
                        size="$3"
                        onPress={() => handleJoinStart(leagueId)}
                        backgroundColor={BRAND_NAVY_LIGHT}
                        borderColor={BRAND_NAVY_LIGHT}
                        borderWidth={2}
                        hoverStyle={{ backgroundColor: BRAND_NAVY }}
                        pressStyle={{
                          scale: 0.97,
                          backgroundColor: BRAND_NAVY_DARK,
                        }}
                      >
                        <Text color={BRAND_GOLD} fontWeight="600" size="$3">
                          Join League →
                        </Text>
                      </Button>
                    </XStack>
                  ))}
              </YStack>
            </Card>
          );
        })}
      </YStack>

      {/* Footer CTA */}
      {leagues.length > 0 && (
        <Card
          bordered
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.1)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
          padding="$4"
        >
          <XStack
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap="$3"
          >
            <YStack>
              <Text size="$4" fontWeight="600" color="$color">
                Can't find the right league?
              </Text>
              <Text size="$3" color="$gray10">
                Create your own public league and invite players in!
              </Text>
            </YStack>
            <Button
              size="$4"
              onPress={() => navigate('/baseball/league/create')}
              backgroundColor={BRAND_NAVY_LIGHT}
              borderColor={BRAND_NAVY_LIGHT}
              borderWidth={2}
              hoverStyle={{ backgroundColor: BRAND_NAVY }}
              pressStyle={{ scale: 0.97 }}
            >
              <Text color={BRAND_GOLD} fontWeight="600">
                Create League
              </Text>
            </Button>
          </XStack>
        </Card>
      )}
    </YStack>
  );
}

export default LeagueDiscoveryPage;
