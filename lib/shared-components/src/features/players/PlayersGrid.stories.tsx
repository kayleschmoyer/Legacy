import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { MockedProvider } from '@apollo/client/testing';
import { PlayersGrid } from './PlayersGrid';
import { GET_ALL_PLAYERS } from './PlayersApi';

const mockPlayers = Array.from({ length: 20 }, (_, i) => ({
  __typename: 'Player' as const,
  id: i + 1,
  name: `Player ${i + 1}`,
  brefId: `player${String(i + 1).padStart(2, '0')}`,
}));

const successMock = {
  request: {
    query: GET_ALL_PLAYERS,
    variables: {
      first: 50,
      orderBy: ['NAME_ASC'],
    },
  },
  result: {
    data: {
      players: {
        __typename: 'PlayersConnection',
        nodes: mockPlayers,
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          endCursor: null,
        },
      },
    },
  },
};

const loadingMock = {
  request: {
    query: GET_ALL_PLAYERS,
    variables: {
      first: 50,
      orderBy: ['NAME_ASC'],
    },
  },
  result: {
    data: {
      players: {
        __typename: 'PlayersConnection',
        nodes: mockPlayers,
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          endCursor: null,
        },
      },
    },
  },
  delay: 3000, // 3 second delay to show loading state
};

const errorMock = {
  request: {
    query: GET_ALL_PLAYERS,
    variables: {
      first: 50,
      orderBy: ['NAME_ASC'],
    },
  },
  error: new globalThis.Error('Failed to load players'),
};

const emptyMock = {
  request: {
    query: GET_ALL_PLAYERS,
    variables: {
      first: 50,
      orderBy: ['NAME_ASC'],
    },
  },
  result: {
    data: {
      players: {
        __typename: 'PlayersConnection',
        nodes: [],
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          endCursor: null,
        },
      },
    },
  },
};

const meta: Meta<typeof PlayersGrid> = {
  title: 'Features/Players/PlayersGrid',
  component: PlayersGrid,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlayerSelect: { action: 'player-selected' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[successMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
  },
};

export const Loading: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[loadingMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
  },
};

export const Error: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[errorMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
  },
};

export const Empty: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[emptyMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
  },
};

export const WithoutSearch: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[successMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
    showSearch: false,
  },
};

export const WithoutSorting: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[successMock]} addTypename={false}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockedProvider>
    ),
  ],
  args: {
    onPlayerSelect: action('player-selected'),
    showSorting: false,
  },
};
