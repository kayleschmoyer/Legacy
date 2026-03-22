import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SportHome } from './SportHome';
import { League, PlayerPool, User } from '../../types';

const mockUser: User = {
  id: 'user-1',
  name: 'Alex',
  email: 'alex@example.com',
};

const mockLeagues: League[] = [
  {
    id: 'league-1',
    name: 'Home Run Heroes',
    sport: 'baseball',
    numberOfTeams: 10,
    draftDate: new Date('2026-04-15'),
    playerPool: PlayerPool.ALL,
    ownerId: 'user-1',
  },
  {
    id: 'league-2',
    name: 'Diamond Dynasty',
    sport: 'baseball',
    numberOfTeams: 12,
    draftDate: new Date('2026-05-01'),
    playerPool: PlayerPool.NL,
    ownerId: 'user-2',
  },
];

const meta: Meta<typeof SportHome> = {
  title: 'Features/Sports/SportHome',
  component: SportHome,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sport home screen showing league list, quick actions, and create/join modals.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Baseball: Story = {
  args: {
    sport: 'baseball',
    user: mockUser,
    leagues: [],
    onCreateLeague: fn(),
    onLeaguePress: fn(),
  },
};

export const WithLeagues: Story = {
  args: {
    sport: 'baseball',
    user: mockUser,
    leagues: mockLeagues,
    onCreateLeague: fn(),
    onJoinLeague: fn(),
    onLeaguePress: fn(),
    onInviteFriends: fn(),
  },
};

export const Loading: Story = {
  args: {
    sport: 'baseball',
    user: mockUser,
    leagues: [],
    onCreateLeague: fn(),
    onLeaguePress: fn(),
    loading: true,
  },
};
