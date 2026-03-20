import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { ChatPanel } from './ChatPanel';

const meta: Meta<typeof ChatPanel> = {
  title: 'Features/Draft/ChatPanel',
  component: ChatPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'League chat UI with message input, send button, and scrollable message list.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ width: '360px', height: '480px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClose: fn(),
    leagueId: 'league-123',
  },
};

export const CloseInteraction: Story = {
  args: {
    onClose: fn(),
    leagueId: 'league-123',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const closeButton = canvas.getByText('X');
    await userEvent.click(closeButton);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
  tags: ['autodocs', 'test'],
};

export const SendMessageInteraction: Story = {
  args: {
    onClose: fn(),
    leagueId: 'league-456',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText('Type message...');
    await userEvent.type(input, 'Hello team!');
    const sendButton = canvas.getByText('Send');
    await userEvent.click(sendButton);
    await expect(canvas.getByText('You: Hello team!')).toBeVisible();
  },
  tags: ['autodocs', 'test'],
};
