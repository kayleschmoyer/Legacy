import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button, Text, XStack } from 'tamagui';
import { Dialog } from './Dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function DefaultDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <XStack>
      <Button onPress={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Confirm trade"
        description="Send Babe Ruth + Cy Young in exchange for Mike Trout? Trades cannot be reversed once accepted."
        confirmLabel="Send Trade"
        cancelLabel="Cancel"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <Text fontFamily="$body" color="$color" fontSize={14}>
          League veto window: 24 hours.
        </Text>
      </Dialog>
    </XStack>
  );
}

function DestructiveDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <XStack>
      <Button onPress={() => setOpen(true)}>Delete league</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        eyebrow="Commissioner action"
        title="Delete this league?"
        description="This will permanently remove Dead Ball Dynasty, all 12 rosters, and 14 weeks of recorded matchups. This cannot be undone."
        confirmLabel="Delete League"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </XStack>
  );
}

export const Default: Story = { render: () => <DefaultDemo /> };
export const Destructive: Story = { render: () => <DestructiveDemo /> };
