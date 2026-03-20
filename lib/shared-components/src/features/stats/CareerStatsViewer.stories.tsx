import type { Meta, StoryObj } from '@storybook/react';
import { CareerStatsViewer } from './CareerStatsViewer';

const meta: Meta<typeof CareerStatsViewer> = {
  title: 'Features/Stats/CareerStatsViewer',
  component: CareerStatsViewer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Multi-stat viewer for career batting, pitching, and fielding statistics. Fetches data from an API by player ID and displays results in cross-platform tables.',
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
  args: {
    apiEndpoint: 'https://api.example.com/career-stats',
  },
};

export const CustomEndpoint: Story = {
  args: {
    apiEndpoint: 'https://api.example.com/career-stats',
  },
};
