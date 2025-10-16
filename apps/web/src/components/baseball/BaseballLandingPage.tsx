import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  Paragraph,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Dialog, Input, Separator, styled, Text } from 'tamagui';
import { League, LeagueCard } from './LeagueCard';
import {
  GetUserLeagues,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
} from '../../api/db/graphql.generated';

const PageContainer = styled(YStack, {
  flex: 1,
  backgroundColor: '$background',
  minHeight: '100vh',
  paddingTop: '$4',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1200,
  width: '100%',
  alignSelf: 'center',
  padding: '$6',
  gap: '$8',
});

const HeroSection = styled(YStack, {
  alignItems: 'center',
  textAlign: 'center',
  padding: '$8',
  backgroundColor: '$orange2',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$orange6',
  position: 'relative',
  overflow: 'hidden',
  shadowColor: '$orange4',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
});

const HeroTitle = styled(H1, {
  fontSize: '$11',
  fontWeight: '800',
  color: '$orange11',
  marginBottom: '$3',
  textAlign: 'center',
  lineHeight: '$10',
  $sm: {
    fontSize: '$9',
  },
});

const HeroSubtitle = styled(Paragraph, {
  fontSize: '$6',
  color: '$orange10',
  marginBottom: '$6',
  maxWidth: 600,
  textAlign: 'center',
  lineHeight: '$6',
  $sm: {
    fontSize: '$5',
  },
});

const LeaguesSection = styled(YStack, {
  gap: '$5',
});

const SectionHeader = styled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: '$4',
  $sm: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$3',
  },
});

const SectionTitle = styled(H2, {
  fontSize: '$8',
  fontWeight: '700',
  color: '$color',
});

const LeaguesGrid = styled(XStack, {
  gap: '$6',
  flexWrap: 'wrap',
  justifyContent: 'flex-start',
});

const EmptyState = styled(YStack, {
  alignItems: 'center',
  padding: '$10',
  gap: '$5',
  backgroundColor: '$gray2',
  borderRadius: '$6',
  borderWidth: 2,
  borderColor: '$borderColor',
  borderStyle: 'dashed',
  minHeight: 300,
  justifyContent: 'center',
});

const EmptyStateIcon = styled(YStack, {
  fontSize: '4rem',
  marginBottom: '$2',
});

const EmptyStateTitle = styled(H2, {
  fontSize: '$7',
  fontWeight: '600',
  color: '$color',
  textAlign: 'center',
});

const EmptyStateDescription = styled(Paragraph, {
  fontSize: '$4',
  color: '$color11',
  textAlign: 'center',
  maxWidth: 400,
  lineHeight: '$5',
});

const ActionButtonsRow = styled(XStack, {
  gap: '$3',
  justifyContent: 'center',
  flexWrap: 'wrap',
  marginTop: '$5',
});

const PrimaryButton = styled(Button, {
  backgroundColor: '$sportBaseballPrimary',
  borderColor: '$sportBaseballPrimary',
  borderRadius: '$4',
  height: '$5',
  fontSize: '$4',
  fontWeight: '600',
  paddingHorizontal: '$6',
  hoverStyle: {
    backgroundColor: '$blue7',
    borderColor: '$blue7',
  },
  pressStyle: {
    backgroundColor: '$blue8',
  },
});

const SecondaryButton = styled(Button, {
  backgroundColor: 'transparent',
  borderColor: '$sportBaseballPrimary',
  borderWidth: 2,
  borderRadius: '$4',
  height: '$5',
  fontSize: '$4',
  fontWeight: '600',
  paddingHorizontal: '$6',
  color: '$sportBaseballPrimary',
  hoverStyle: {
    backgroundColor: '$blue1',
    borderColor: '$blue7',
  },
});

const NoticeCard = styled(YStack, {
  backgroundColor: '$blue2',
  borderRadius: '$4',
  padding: '$4',
  borderLeftWidth: 4,
  borderLeftColor: '$blue8',
  marginBottom: '$4',
});

export function BaseballLandingPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [leagueName, setLeagueName] = React.useState('');
  const [teamCount, setTeamCount] = React.useState<number>(10);
  const [search, setSearch] = React.useState('');

  // Fetch user leagues from GraphQL
  const {
    data,
    loading: isLoading,
    error,
  } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !auth?.user,
  });

  const [createLeague, { loading: creating }] = useCreateLeagueAndTeamsMutation(
    {
      update: (cache, { data }) => {
        const newLeague = data?.createLeagueAndTeams?.league;
        if (!newLeague) return;
        try {
          const existing = cache.readQuery<{ userLeagues: League[] }>({
            query: GetUserLeagues,
          });
          if (existing?.userLeagues) {
            cache.writeQuery({
              query: GetUserLeagues,
              data: { userLeagues: [...existing.userLeagues, newLeague] },
            });
          }
        } catch {
          // ignore; query may not be in cache yet
        }
      },
      onCompleted: (res) => {
        const id = res.createLeagueAndTeams?.league?.id;
        if (id) navigate(`/baseball/league/${id}`);
      },
    },
  );

  // Map GraphQL data to our League interface
  const leagues: League[] =
    data?.userLeagues?.map((league) => ({
      id: league.id || 0,
      name: league.name || '',
      owner: league.owner || 0,
      maxRosterSize: league.maxRosterSize || 25,
      currentMatchup: league.currentMatchup,
    })) || [];

  const handleViewLeague = (leagueId: number) => {
    navigate(`/baseball/league/${leagueId}`);
  };

  const handleCreateLeague = () => {
    setShowCreateDialog(true);
  };

  const handleJoinLeague = () => {
    navigate('/baseball/league/join');
  };

  if (isLoading) {
    return (
      <PageContainer role="main" aria-busy="true" aria-live="polite">
        <ContentContainer>
          <YStack
            alignItems="center"
            justifyContent="center"
            flex={1}
            minHeight={400}
            role="status"
          >
            <Paragraph fontSize="$6" color="$color11">
              Loading your leagues...
            </Paragraph>
          </YStack>
        </ContentContainer>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer role="main" aria-live="assertive">
        <ContentContainer>
          <YStack
            alignItems="center"
            justifyContent="center"
            flex={1}
            minHeight={400}
            gap="$4"
            role="alert"
          >
            <Paragraph fontSize="$6" color="$red10">
              Failed to load leagues
            </Paragraph>
            <SecondaryButton onPress={() => window.location.reload()}>
              <Text>Try Again</Text>
            </SecondaryButton>
          </YStack>
        </ContentContainer>
      </PageContainer>
    );
  }

  const filteredLeagues = leagues.filter((l) =>
    (l?.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PageContainer
      role="main"
      aria-label="Baseball fantasy landing page"
      style={{
        background: `
          radial-gradient(circle at 20% 30%, rgba(255, 165, 0, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(255, 140, 0, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(255, 69, 0, 0.06) 0%, transparent 40%),
          hsl(var(--background))
        `,
        backgroundAttachment: 'fixed',
      }}
    >
      <ContentContainer>
        {/* Hero Section */}
        <HeroSection
          role="region"
          aria-labelledby="baseball-hero-title"
          style={{
            background:
              'linear-gradient(135deg, hsl(var(--orange2)) 0%, hsl(var(--orange3)) 100%)',
          }}
        >
          <HeroTitle id="baseball-hero-title">
            <span role="img" aria-label="baseball">
              ⚾
            </span>{' '}
            Baseball Fantasy
          </HeroTitle>
          <HeroSubtitle>
            Welcome back, {auth?.user?.username || 'Player'}!{' '}
            {leagues.length > 0
              ? `You're in ${leagues.length} league${leagues.length === 1 ? '' : 's'}.`
              : 'Create or join leagues to get started!'}
          </HeroSubtitle>
          <ActionButtonsRow>
            <PrimaryButton onPress={handleCreateLeague}>
              <Text>
                <span role="img" aria-label="create">
                  ➕
                </span>{' '}
                Create League
              </Text>
            </PrimaryButton>
            <SecondaryButton onPress={handleJoinLeague}>
              <Text>
                <span role="img" aria-label="join">
                  🤝
                </span>{' '}
                Join League
              </Text>
            </SecondaryButton>
          </ActionButtonsRow>
        </HeroSection>

        {/* Notice about current state - Only show if user is not authenticated */}
        {!auth?.user && (
          <NoticeCard>
            <Paragraph
              fontSize="$4"
              color="$blue11"
              fontWeight="600"
              marginBottom="$2"
            >
              <span role="img" aria-label="info">
                ℹ️
              </span>{' '}
              Authentication Required
            </Paragraph>
            <Paragraph fontSize="$3" color="$blue10" lineHeight="$4">
              Please sign in to view and manage your fantasy baseball leagues.
            </Paragraph>
          </NoticeCard>
        )}

        {/* Leagues Section */}
        <LeaguesSection role="region" aria-labelledby="your-leagues-title">
          <SectionHeader>
            <SectionTitle id="your-leagues-title">Your Leagues</SectionTitle>
            {leagues.length > 0 && (
              <XStack alignItems="center" gap="$3">
                {/* Accessible label for search */}
                <label htmlFor="league-search" className="sr-only">
                  Search leagues
                </label>
                <Input
                  size="$4"
                  placeholder="Search leagues..."
                  value={search}
                  onChangeText={setSearch}
                  backgroundColor="$color1"
                  borderColor="$borderColor"
                  width={280}
                  id="league-search"
                  role="searchbox"
                  aria-label="Search leagues"
                />
              </XStack>
            )}
          </SectionHeader>

          {filteredLeagues.length > 0 ? (
            <LeaguesGrid
              data-testid="leagues-grid"
              justifyContent="center"
              $gtSm={{ justifyContent: 'flex-start', gap: '$5' }}
              style={{
                animation: 'fadeInUp 0.5s ease-out',
              }}
            >
              {filteredLeagues.map((league, index) => (
                <LeagueCard
                  key={league.id}
                  league={league}
                  onViewLeague={handleViewLeague}
                  animationDelay={index * 100}
                />
              ))}
            </LeaguesGrid>
          ) : (
            <EmptyState>
              <EmptyStateIcon>
                <span role="img" aria-label="stadium">
                  🏟️
                </span>
              </EmptyStateIcon>
              <EmptyStateTitle>No Leagues Yet</EmptyStateTitle>
              <EmptyStateDescription>
                You haven't joined any leagues yet. Create your first league to
                get started with fantasy baseball!
              </EmptyStateDescription>
              <ActionButtonsRow>
                <PrimaryButton onPress={handleCreateLeague}>
                  Create Your First League
                </PrimaryButton>
              </ActionButtonsRow>
            </EmptyState>
          )}
        </LeaguesSection>
      </ContentContainer>

      {/* Create League - Quick Dialog */}
      <Dialog modal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay
            animation="quick"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            maxWidth={560}
            width="100%"
            backgroundColor="$color2"
            borderColor="$borderColor"
            animation="quick"
            enterStyle={{ opacity: 0, y: -10 }}
            exitStyle={{ opacity: 0, y: 10 }}
            aria-labelledby="create-league-title"
            aria-describedby="create-league-desc"
          >
            <YStack space="$4">
              <YStack>
                <H2 size="$6" id="create-league-title">
                  Create League
                </H2>
                <Paragraph color="$gray11" id="create-league-desc">
                  Create a new league in seconds. You can fine-tune settings
                  later.
                </Paragraph>
              </YStack>

              <YStack space="$3">
                <Text fontWeight="600" color="$gray12">
                  League Name
                </Text>
                <Input
                  placeholder="e.g., Saturday Sluggers"
                  value={leagueName}
                  onChangeText={setLeagueName}
                  autoFocus
                  aria-label="League name"
                />
              </YStack>

              <YStack space="$3">
                <Text fontWeight="600" color="$gray12">
                  Number of Teams
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {[6, 8, 10, 12, 14, 16].map((n) => (
                    <Button
                      key={n}
                      size="$3"
                      variant={teamCount === n ? 'primary' : 'outlined'}
                      onPress={() => setTeamCount(n)}
                      backgroundColor={teamCount === n ? '$blue8' : '$color2'}
                      borderColor={teamCount === n ? '$blue8' : '$borderColor'}
                      borderWidth={teamCount === n ? 2 : 1}
                      aria-pressed={teamCount === n}
                      aria-label={`Select ${n} teams`}
                    >
                      <Text color={teamCount === n ? '$blue12' : '$color'}>
                        {n}
                      </Text>
                    </Button>
                  ))}
                </XStack>
              </YStack>

              <Separator />

              <XStack justifyContent="flex-end" gap="$3">
                <Dialog.Close asChild>
                  <SecondaryButton disabled={creating}>Cancel</SecondaryButton>
                </Dialog.Close>
                <PrimaryButton
                  disabled={creating || leagueName.trim().length < 3}
                  onPress={() => {
                    const startDate = new Date(
                      Date.now() + 7 * 24 * 60 * 60 * 1000,
                    )
                      .toISOString()
                      .split('T')[0];
                    void createLeague({
                      variables: {
                        input: {
                          leagueName: leagueName.trim(),
                          numberOfTeams: teamCount,
                          draftType: 'NORMAL',
                          startDate,
                          isPublic: false,
                          tradingEnabled: true,
                          waiverEnabled: true,
                        },
                      },
                    });
                  }}
                >
                  {creating ? 'Creating…' : 'Create League'}
                </PrimaryButton>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </PageContainer>
  );
}
