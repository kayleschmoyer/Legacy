import type { Meta, StoryObj } from '@storybook/react';
import { GameLogsTable } from './GameLogsTable';

const meta: Meta<typeof GameLogsTable> = {
  title: 'Features/Stats/GameLogsTable',
  component: GameLogsTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Stats viewer with a form to fetch game logs by player ID and optional date. Displays results in a cross-platform table.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const CustomEndpoint: Story = {
  args: {
    apiEndpoint: 'https://api.example.com/game-logs',
  },
};
