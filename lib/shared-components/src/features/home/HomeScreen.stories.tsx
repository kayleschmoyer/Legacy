import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Text, YStack } from 'tamagui';
import { type HomeLeagueSummary, HomeScreen } from './HomeScreen';

const activeNoMatchup: HomeLeagueSummary = {
  leagueId: 1,
  leagueName: 'Test League 1',
  sport: 'baseball',
  leaguePhase: 'active',
  wins: 1,
  losses: 1,
  rank: 7,
  totalTeams: 12,
  teamCount: 5,
  currentWeekNumber: 1,
  totalMatchups: 10,
};

const liveMatchup: HomeLeagueSummary = {
  leagueId: 2,
  leagueName: 'Steroid Era Showdown',
  sport: 'baseball',
  leaguePhase: 'active',
  wins: 5,
  losses: 3,
  rank: 3,
  totalTeams: 10,
  teamCount: 10,
  currentWeekNumber: 9,
  totalMatchups: 18,
  matchupId: 7,
  matchupStatus: 'in_progress',
  userScore: 118.2,
  opponentScore: 104.6,
  opponentTeamName: 'Rival FC',
  isCommissioner: true,
};

const preDraft: HomeLeagueSummary = {
  leagueId: 3,
  leagueName: 'Modern Metrics',
  sport: 'baseball',
  leaguePhase: 'pre-draft',
  teamCount: 12,
  draftScheduledAt: '2026-08-28T20:00:00.000Z',
};

const footballLive: HomeLeagueSummary = {
  leagueId: 4,
  leagueName: 'Air Coryell Revival',
  sport: 'football',
  leaguePhase: 'active',
  wins: 4,
  losses: 4,
  rank: 6,
  totalTeams: 12,
  teamCount: 12,
  currentWeekNumber: 9,
  totalMatchups: 17,
};

const onThisDay = (
  <YStack gap="$2">
    <Text fontWeight="700">On This Day</Text>
    <Text>1927 — Babe Ruth hits his 40th of the season.</Text>
  </YStack>
);

const meta: Meta<typeof HomeScreen> = {
  title: 'Features/Home/HomeScreen',
  component: HomeScreen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Cross-platform Home dashboard: ticket-stock/playboard hero, glass league rows, quick actions, and the sticky On This Day rail.',
      },
    },
  },
  args: {
    userName: 'Casey',
    onViewLeague: fn(),
    onSetLineup: fn(),
    onMockDraft: fn(),
    onCreateLeague: fn(),
    onJoinLeague: fn(),
    onBrowseStats: fn(),
    onViewSport: fn(),
    onStartMockDraft: fn(),
    onSeeAllLeagues: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Mirrors the LS-9047 no-current-matchup hero plus row + rail variants. */
export const ReturningUser: Story = {
  args: {
    leagues: [activeNoMatchup, liveMatchup, preDraft],
    archivedCount: 4,
    onShowArchived: fn(),
    onThisDay,
  },
};

export const FootballHero: Story = {
  args: {
    leagues: [footballLive, activeNoMatchup],
    onThisDay,
  },
};

export const NewUser: Story = {
  args: {
    leagues: [],
  },
};
