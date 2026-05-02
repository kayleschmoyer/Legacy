import type { Meta, StoryObj } from '@storybook/react';
import { Button, YStack } from 'tamagui';
import { NavBar } from './NavBar';
import { NotificationBell } from './NotificationBell';

const meta: Meta<typeof NavBar> = {
  title: 'Components/NavBar',
  component: NavBar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <YStack width="100%" minHeight={120} backgroundColor="$bg">
      <NavBar
        brand="Legacy Sports"
        links={[
          { label: 'Home', active: true },
          { label: 'Leagues' },
          { label: 'Players' },
          { label: 'Draft' },
          { label: 'Standings' },
        ]}
        trailing={
          <>
            <NotificationBell
              items={[
                {
                  id: '1',
                  title: 'You are on the clock',
                  time: 'now',
                  unread: true,
                },
              ]}
            />
            <Button size="$3" chromeless>
              W. Mays
            </Button>
          </>
        }
      />
    </YStack>
  ),
};
